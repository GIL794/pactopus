# Android build route (preparation notes, nothing built yet)

Source: https://docs.solanamobile.com/dapp-store/build-and-sign-an-apk (Web App tab).

- The docs say a Trusted Web Activity wrapper can break Mobile Wallet Adapter connections, and recommend the `solana-mobile webshell` wrapper for web apps. dapp-store/config.yaml and .env.example currently assume a TWA.
- The web app must be reachable at a public URL, use @solana-mobile/wallet-standard-mobile 0.5.1 or later (registration is in components/MwaRegister.tsx), and the machine needs JDK 17+ and the Android SDK (`npx solana-mobile@latest doctor` checks).
- Generate: `npx solana-mobile@latest webshell` and answer its prompts (application id, app name, version, keystore). The application id must match the permanent package name you choose for the store. Build: `npx solana-mobile@latest webshell build <project>`. Verify: `apksigner verify --print-certs <apk>`.
- The release keystore and its passwords are created and kept by you. Do not commit them. Losing them blocks future updates.
- After the keystore exists, the SHA-256 certificate fingerprint replaces the all-zero values in dapp-store/config.yaml and public/.well-known/assetlinks.json. A webshell does not use Digital Asset Links, so assetlinks.json may be removable. Confirm against the generated project.
- Test on a device or emulator before submitting. Wallet flows inside the shell are unproven until then.
