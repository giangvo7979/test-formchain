# test-formchain

A minimal React + TypeScript app to read and decrypt **Walrus blobs** with **Mysten Seal** — built on top of [FormChain](https://yangbum.wal.app)'s on-chain form/response infrastructure on Sui Mainnet.

## What it does

- Connects to your Sui wallet via `@mysten/dapp-kit`
- Loads **all forms** from the FormChain smart contract on-chain
- Lists responses for each form (fetched via Sui dynamic fields)
- Downloads blob data from Walrus and displays submission content
- Decrypts **Seal-encrypted** responses (whole-blob or per-field) by signing a session key with your wallet

## Tech Stack

| | |
|---|---|
| Framework | React 18 + TypeScript |
| Wallet | `@mysten/dapp-kit` |
| Blockchain | Sui Mainnet |
| Storage | Walrus (`@mysten/walrus`) |
| Encryption | Mysten Seal (`@mysten/seal`) |
| Build | Vite |

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/giangvo7979/test-formchain.git
cd test-formchain
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` (or edit `.env` directly):

```env
VITE_PACKAGE_ID=0xb0230f55f042d55838f312cb193ec67df1ed2a0fb2ce48a18183e7e67878103f
VITE_REGISTRY_ID=0xc7c1b0db4d7a7268197af81821ac0bbd3d2db2a756400507fc0a32666d4416fd
VITE_WALRUS_AGGREGATOR=https://aggregator.walrus-mainnet.walrus.space
VITE_WALRUS_PUBLISHER=https://publisher.walrus-mainnet.walrus.space
VITE_NETWORK=mainnet
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Usage

1. **Connect wallet** — any Sui wallet (Slush, Suiet, etc.)
2. **Browse forms** — all FormChain forms are loaded from the smart contract automatically
3. **Select a form** — responses are fetched from on-chain dynamic fields
4. **Click a response** — blob data is downloaded from Walrus and displayed
5. **Decrypt if needed**:
   - *Seal-encrypted blob* → click **Decrypt with Seal**, sign the session key in your wallet
   - *Per-field sealed* → click **Decrypt** next to individual fields

> Only the form owner's wallet can decrypt Seal-encrypted responses.

## Project Structure

```
src/
├── App.tsx              # Main dashboard UI
├── main.tsx             # Wallet providers setup
├── index.css            # Styles
├── lib/
│   ├── seal.ts          # Seal session key + encrypt/decrypt
│   ├── walrus.ts        # Walrus upload/download helpers
│   ├── contract.ts      # Sui on-chain queries & tx builders
│   └── constants.ts     # Package IDs, network config
├── store/
│   └── index.ts         # Zustand state (forms, responses)
└── types/
    └── index.ts         # Shared TypeScript types
```