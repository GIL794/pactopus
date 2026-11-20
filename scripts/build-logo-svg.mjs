import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const logoPngPath = path.join(projectRoot, 'public', 'logo.png');
const logoSvgPath = path.join(projectRoot, 'public', 'logo.svg');

const imgBuffer = fs.readFileSync(logoPngPath);
const base64Data = imgBuffer.toString('base64');
const dataUri = `data:image/png;base64,${base64Data}`;

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <defs>
    <!-- Dynamic Blockchain Palette Filter: Algorand (Emerald Teal / Mint) -->
    <filter id="pactopus-algorand" color-interpolation-filters="sRGB">
      <feColorMatrix type="hueRotate" values="-40" />
      <feColorMatrix type="matrix" values="1.05 0 0 0 0  0 1.25 0 0 0  0 0 1.10 0 0  0 0 0 1 0" />
    </filter>

    <!-- Dynamic Blockchain Palette Filter: Arc (Warm Coral / Gold / Amber) -->
    <filter id="pactopus-arc" color-interpolation-filters="sRGB">
      <feColorMatrix type="hueRotate" values="-152" />
      <feColorMatrix type="matrix" values="1.30 0 0 0 0  0 1.15 0 0 0  0 0 0.90 0 0  0 0 0 1 0" />
    </filter>

    <style>
      .pactopus-artwork {
        transition: filter 0.4s ease-in-out;
      }
      :root[data-network="algorand"] .pactopus-artwork,
      .network-algorand .pactopus-artwork,
      svg.algorand .pactopus-artwork {
        filter: url(#pactopus-algorand);
      }
      :root[data-network="arc"] .pactopus-artwork,
      .network-arc .pactopus-artwork,
      svg.arc .pactopus-artwork {
        filter: url(#pactopus-arc);
      }
      @media (prefers-color-scheme: light) {
        .pactopus-bg {
          fill: #000000;
        }
      }
    </style>
  </defs>

  <!-- Deep space canvas backdrop for seamless integration -->
  <rect width="1024" height="1024" fill="#000000" class="pactopus-bg" rx="24" />

  <!-- Authentic Pactopus Cybernetic Scholar Mascot Artwork -->
  <image
    href="${dataUri}"
    x="0"
    y="0"
    width="1024"
    height="1024"
    preserveAspectRatio="xMidYMid meet"
    class="pactopus-artwork"
  />
</svg>
`;

fs.writeFileSync(logoSvgPath, svgContent, 'utf8');
console.log('Successfully wrote', logoSvgPath, 'size:', fs.statSync(logoSvgPath).size);
