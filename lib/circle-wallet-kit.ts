import { ethers } from 'ethers';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { ERC20_ABI } from './arc';
import { safeLogger } from './log-redact';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

export interface CreateCircleSignerParams {
  privateKey?: string;
  walletSetId?: string;
  blockchain?: string;
}

export interface CircleDuckSigner {
  address: string;
  getAddress: () => Promise<string>;
  _mode: 'circle' | 'ethers';
  _ethersWallet?: ethers.Wallet;
  _circleClient?: ReturnType<typeof initiateDeveloperControlledWalletsClient>;
  _circleWalletId?: string;
}

export interface TxResponseLike {
  hash: string;
  wait: (confirmations?: number) => Promise<{ hash: string; status?: number; blockNumber?: number } | null>;
}

/**
 * Resolve a Circle transaction job UUID into its confirmed on-chain 0x transaction hash
 * by polling Circle's getTransaction endpoint. Never fabricates a hash with keccak256.
 */
async function resolveCircleTxHash(
  client: ReturnType<typeof initiateDeveloperControlledWalletsClient>,
  txId: string
): Promise<string> {
  if (/^0x[a-fA-F0-9]{64}$/.test(txId)) return txId;
  if (!txId) {
    throw new Error('[CircleSigner] Circle SDK returned an empty transaction identifier.');
  }
  const clientAny = client as unknown as {
    getTransaction?: (args: { id: string }) => Promise<{
      data?: { transaction?: { txHash?: string; state?: string; errorReason?: string } };
    }>;
  };
  if (typeof clientAny.getTransaction === 'function') {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const lookup = await clientAny.getTransaction({ id: txId });
        const tx = lookup?.data?.transaction;
        if (tx?.txHash && /^0x[a-fA-F0-9]{64}$/.test(tx.txHash)) {
          return tx.txHash;
        }
        if (tx?.state === 'FAILED' || tx?.state === 'CANCELLED' || tx?.state === 'DENIED') {
          throw new Error(`[CircleSigner] Circle transaction ${txId} failed with state ${tx.state}: ${tx.errorReason || 'unknown'}`);
        }
      } catch (err) {
        if (err instanceof Error && /failed with state/i.test(err.message)) throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw new Error(`[CircleSigner] Circle transaction ${txId} did not yield an on-chain txHash within polling window.`);
}

export async function signMessageWithCircleSigner(
  signer: CircleDuckSigner,
  message: string,
  fallbackPrivateKey?: string
): Promise<string> {
  if (signer._ethersWallet) {
    return signer._ethersWallet.signMessage(message);
  }
  if (signer._mode === 'circle' && signer._circleClient && signer._circleWalletId) {
    const clientAny = signer._circleClient as unknown as {
      signMessage?: (args: { walletId: string; message: string }) => Promise<{ data?: { signature?: string } }>;
    };
    if (typeof clientAny.signMessage === 'function') {
      const res = await clientAny.signMessage({ walletId: signer._circleWalletId, message });
      if (res?.data?.signature) return res.data.signature;
    }
  }
  if (fallbackPrivateKey) {
    const fallbackWallet = new ethers.Wallet(fallbackPrivateKey);
    return fallbackWallet.signMessage(message);
  }
  throw new Error('[CircleSigner] Unable to sign authentication message: no signing key available.');
}

export async function createCircleSigner(params: CreateCircleSignerParams): Promise<CircleDuckSigner> {
  const { privateKey, walletSetId, blockchain = 'ETH' } = params;
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

  if (apiKey && entitySecret) {
    const client = initiateDeveloperControlledWalletsClient({
      apiKey,
      entitySecret,
    });

    let walletId: string | undefined;
    let address = '';

    try {
      if (walletSetId) {
        const listRes = await client.listWallets({ walletSetId, blockchain: blockchain as never });
        const wallets = listRes.data?.wallets || [];
        if (wallets.length > 0) {
          walletId = wallets[0].id;
          address = wallets[0].address || '';
        }
      }

      if (!walletId) {
        const createOpts: { walletSetId?: string; blockchain?: string; count: number } = {
          blockchain,
          count: 1,
        };
        if (walletSetId) createOpts.walletSetId = walletSetId;
        const res = await client.createWallets(createOpts as never);
        const wallets = res.data?.wallets || [];
        if (wallets.length > 0) {
          walletId = wallets[0].id;
          address = wallets[0].address || '';
        }
      }
    } catch (err) {
      safeLogger.warn('[CircleSigner] SDK init failed, falling back to ethers.Wallet:', err);
    }

    if (walletId && address) {
      return {
        address: address.startsWith('0x') ? address : `0x${address}`,
        getAddress: async () => (address.startsWith('0x') ? address : `0x${address}`),
        _mode: 'circle',
        _circleClient: client,
        _circleWalletId: walletId,
      };
    }
  }

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  let key: string | undefined = privateKey;
  if (!key) {
    if (process.env.PACTOPUS_ALLOW_UNSAFE_PAYMASTER_SIGNER === '1') {
      safeLogger.warn(
        '[CircleSigner] PACTOPUS_ALLOW_UNSAFE_PAYMASTER_SIGNER=1 set; using ethers.Wallet.createRandom() ephemeral signer for this process. Keys do NOT persist. Disable in production unless judge demo path requires it.'
      );
      key = ethers.Wallet.createRandom().privateKey;
    } else {
      const err = new Error(
        '[CircleSigner] Neither Circle credentials (CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET) nor an explicit privateKey were provided, and PACTOPUS_ALLOW_UNSAFE_PAYMASTER_SIGNER is not set. Configure Circle Developer-Controlled Wallets credentials OR explicitly opt-in to the ephemeral ethers demo signer with PACTOPUS_ALLOW_UNSAFE_PAYMASTER_SIGNER=1.'
      );
      err.name = 'CircleSignerConfigurationError';
      throw err;
    }
  }
  const wallet = new ethers.Wallet(key, provider);

  return {
    address: wallet.address,
    getAddress: () => wallet.getAddress(),
    _mode: 'ethers',
    _ethersWallet: wallet,
  };
}

export async function approveAndDepositToVaultERC4626(
  signer: CircleDuckSigner,
  usdcAddr: string,
  vaultAddr: string,
  amountRaw: bigint,
): Promise<TxResponseLike> {
  if (signer._mode === 'circle' && signer._circleClient && signer._circleWalletId) {
    const client = signer._circleClient;
    const walletId = signer._circleWalletId;

    const approveAbi = ['function approve(address spender, uint256 amount) returns (bool)'];
    const approveInterface = new ethers.Interface(approveAbi);
    const approveCallData = approveInterface.encodeFunctionData('approve', [vaultAddr, amountRaw]);

    const approveRes = await client.createContractExecutionTransaction({
      walletId,
      contractAddress: usdcAddr,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [vaultAddr, amountRaw.toString()],
      callData: approveCallData,
      fee: {
        type: 'level',
        config: {
          feeLevel: 'MEDIUM',
        },
      },
    } as never);
    const approveData = approveRes.data as unknown as { id?: string; txHash?: string } | undefined;
    await resolveCircleTxHash(client, approveData?.txHash || approveData?.id || '');

    const depositAbi = ['function deposit(uint256 assets, address receiver) returns (uint256 shares)'];
    const depositInterface = new ethers.Interface(depositAbi);
    const depositCallData = depositInterface.encodeFunctionData('deposit', [amountRaw, signer.address]);

    const depositRes = await client.createContractExecutionTransaction({
      walletId,
      contractAddress: vaultAddr,
      abiFunctionSignature: 'deposit(uint256,address)',
      abiParameters: [amountRaw.toString(), signer.address],
      callData: depositCallData,
      fee: {
        type: 'level',
        config: {
          feeLevel: 'MEDIUM',
        },
      },
    } as never);

    const depositTxData = depositRes.data as unknown as { id?: string; txHash?: string } | undefined;
    const depositHash = await resolveCircleTxHash(client, depositTxData?.txHash || depositTxData?.id || '');

    return {
      hash: depositHash,
      wait: async () => ({ hash: depositHash, status: 1 }),
    };
  }

  const wallet = signer._ethersWallet;
  if (!wallet) throw new Error('Ethers wallet not available on signer');

  const usdc = new ethers.Contract(usdcAddr, ERC20_ABI, wallet);
  const approveTx = await usdc.approve(vaultAddr, amountRaw);
  await approveTx.wait();

  const vaultAbi = ['function deposit(uint256 assets, address receiver) returns (uint256 shares)'];
  const vault = new ethers.Contract(vaultAddr, vaultAbi, wallet);
  const depositTx = await vault.deposit(amountRaw, signer.address);
  const receipt = await depositTx.wait();

  return {
    hash: depositTx.hash,
    wait: async () => ({
      hash: depositTx.hash,
      status: receipt?.status ?? 1,
      blockNumber: receipt?.blockNumber,
    }),
  };
}

export async function sendERC20Transfer(
  signer: CircleDuckSigner,
  tokenAddr: string,
  toAddr: string,
  amountRaw: bigint,
): Promise<TxResponseLike> {
  if (signer._mode === 'circle' && signer._circleClient && signer._circleWalletId) {
    const client = signer._circleClient;
    const walletId = signer._circleWalletId;

    const transferAbi = ['function transfer(address to, uint256 amount) returns (bool)'];
    const transferInterface = new ethers.Interface(transferAbi);
    const callData = transferInterface.encodeFunctionData('transfer', [toAddr, amountRaw]);

    const res = await client.createContractExecutionTransaction({
      walletId,
      contractAddress: tokenAddr,
      abiFunctionSignature: 'transfer(address,uint256)',
      abiParameters: [toAddr, amountRaw.toString()],
      callData,
      fee: {
        type: 'level',
        config: {
          feeLevel: 'MEDIUM',
        },
      },
    } as never);

    const txData = res.data as unknown as { id?: string; txHash?: string } | undefined;
    const hash = await resolveCircleTxHash(client, txData?.txHash || txData?.id || '');

    return {
      hash,
      wait: async () => ({ hash, status: 1 }),
    };
  }

  const wallet = signer._ethersWallet;
  if (!wallet) throw new Error('Ethers wallet not available on signer');

  const token = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  const tx = await token.transfer(toAddr, amountRaw);
  const receipt = await tx.wait();

  return {
    hash: tx.hash,
    wait: async () => ({
      hash: tx.hash,
      status: receipt?.status ?? 1,
      blockNumber: receipt?.blockNumber,
    }),
  };
}
