# Claude Code Documentation for Uniswap V3 Core

## Project Overview
This is the **Uniswap V3 Core** repository containing the core smart contracts for the Uniswap V3 Protocol. This is a legitimate decentralized exchange protocol implementation in Solidity.

## Project Structure

### Main Directories
- **`contracts/`** - Core Solidity smart contracts
  - `UniswapV3Factory.sol` - Factory contract for creating pools
  - `UniswapV3Pool.sol` - Main pool contract handling swaps and liquidity
  - `UniswapV3PoolDeployer.sol` - Pool deployment logic
  - `NoDelegateCall.sol` - Security modifier to prevent delegate calls
  - **`interfaces/`** - Contract interfaces and callback definitions
  - **`libraries/`** - Mathematical and utility libraries (BitMath, FullMath, Oracle, etc.)
  - **`test/`** - Test contracts and mock implementations

- **`test/`** - TypeScript test files
  - Comprehensive test suite for all contracts and libraries
  - Gas optimization tests
  - Arbitrage and swap tests
  - **`shared/`** - Shared test utilities and fixtures

- **`audits/`** - Security audit reports
  - **`abdk/`** - ABDK audit
  - **`tob/`** - Trail of Bits audit with additional fuzzing tests

## Build System & Configuration

### Key Files
- **`package.json`** - Dependencies and scripts
- **`hardhat.config.ts`** - Hardhat configuration with network settings
- **`tsconfig.json`** - TypeScript configuration
- **`echidna.config.yml`** - Echidna fuzzing configuration

### Available Scripts
- `npm run compile` - Compile contracts using Hardhat
- `npm run test` - Run the test suite

### Development Environment
- **Solidity Version**: 0.7.6
- **Framework**: Hardhat with TypeScript
- **Testing**: Waffle + Chai with gas snapshots
- **Linting**: Solhint with Prettier
- **Networks**: Configured for mainnet, testnets, and L2s (Arbitrum, Optimism, Polygon, BSC)

## Key Contracts

### UniswapV3Factory (`contracts/UniswapV3Factory.sol`)
- Deploys new UniswapV3Pool contracts
- Manages pool creation and fee tier configuration
- Handles protocol fee ownership

### UniswapV3Pool (`contracts/UniswapV3Pool.sol`)
- Core AMM logic for concentrated liquidity
- Handles swaps, mints, burns, and flash loans
- Implements tick-based liquidity management

### Libraries (`contracts/libraries/`)
- **Math Libraries**: BitMath, FullMath, SqrtPriceMath, SwapMath
- **Data Structures**: Tick, TickBitmap, Position, Oracle
- **Utilities**: TransferHelper, LiquidityMath, SafeCast

## Testing Strategy
- Unit tests for all libraries and contracts
- Gas consumption benchmarks
- Arbitrage and swap scenario testing
- Fuzzing with Echidna
- Security audits by professional firms

## Security Considerations
- Business Source License (BUSL-1.1) with GPL exceptions
- No delegate call prevention
- Comprehensive audit history
- Active bug bounty program

## Development Guidelines
- Follow existing Solidity 0.7.6 patterns
- Use existing mathematical libraries
- Write comprehensive tests with gas snapshots
- Ensure deterministic bytecode compilation
- Follow security best practices for DeFi protocols

## Common Operations
- **Run tests**: `npm run test`
- **Compile contracts**: `npm run compile`
- **Deploy locally**: Import factory bytecode from artifacts
- **Add new fee tiers**: Modify factory configuration
- **Test gas usage**: Check snapshot files in `test/__snapshots__/`

## Network Configuration
The project is configured for deployment on:
- Ethereum mainnet and testnets
- Arbitrum (mainnet and testnet)
- Optimism (mainnet and testnet)
- Polygon (mainnet and Mumbai)
- BSC mainnet

## Important Notes
- This is a production DeFi protocol with significant TVL
- All changes require thorough testing and security review
- Gas optimization is critical for user experience
- Mathematical precision is essential for protocol security
- Follow the existing code style and patterns strictly