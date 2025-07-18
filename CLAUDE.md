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
- **Package Manager**: Uses yarn.lock (Yarn package manager)

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
- Ethereum mainnet and testnets (Ropsten, Rinkeby, Goerli, Kovan)
- Arbitrum (mainnet and Rinkeby testnet)
- Optimism (mainnet and Kovan testnet)
- Polygon (mainnet and Mumbai testnet)
- BSC mainnet

## Important Notes
- This is a production DeFi protocol with significant TVL
- All changes require thorough testing and security review
- Gas optimization is critical for user experience
- Mathematical precision is essential for protocol security
- Follow the existing code style and patterns strictly

## Swap Referrer Fee Implementation Plans

### Implementation Documentation
This repository contains comprehensive implementation plans for adding swap referrer fee functionality to the Uniswap V3 protocol:

- **`referrer-fee-implementation-plan.md`** - Complete plan for adding swap referrer fees to UniswapV3Pool contract
- **`factory-referrer-fee-implementation-plan.md`** - Plan for factory-level swap referrer fee management
- **`factory-router-whitelist-implementation-plan.md`** - Plan for router whitelist in factory
- **`swaprouter-referrer-implementation-plan.md`** - Plan for SwapRouter swap referrer integration

### Swap Referrer Fee System Architecture
The planned swap referrer fee system consists of four main components:

#### 1. Pool-Level Swap Referrer Fees (`UniswapV3Pool.sol`)
- **Fee Structure**: Similar to protocol fees with separate rates for token0 and token1
- **Storage**: `feeSwapReferrer` in Slot0 struct (packed with other fee data)
- **Direct Transfer**: Swap referrer fees sent directly to swap referrer during swap (gas efficient)
- **Swap Integration**: Modified `swap()` function accepts swapReferrer parameter from router
- **Access Control**: Only factory owner can set swap referrer fee rates via `setFeeSwapReferrer()`

#### 2. Factory-Level Fee Management (`UniswapV3Factory.sol`)
- **Default Configuration**: `defaultSwapReferrerFee` for newly created pools
- **Per-Pool Configuration**: `poolSwapReferrerFees` mapping for individual pool settings
- **Management Functions**: `setDefaultSwapReferrerFee()`, `setPoolSwapReferrerFee()`, batch operations
- **Pool Integration**: Automatically configures new pools with default swap referrer fees
- **Access Control**: Only factory owner can modify swap referrer fee configurations

#### 3. Router Whitelist System (`UniswapV3Factory.sol`)
- **Whitelist Storage**: `whitelistedRouters` mapping for approved routers
- **Enumeration Support**: `whitelistedRoutersList` array for governance queries
- **Management Functions**: Add/remove routers individually or in batches
- **Pool Validation**: Pools verify router whitelist before processing swap referrer fees
- **Emergency Controls**: Quick removal and pause functionality for security

#### 4. SwapRouter Integration (`SwapRouter.sol` - Periphery)
- **Global Swap Referrer**: Single swap referrer address for all swaps through the router
- **Owner Management**: Uses OpenZeppelin Ownable for standardized ownership
- **Swap Referrer Configuration**: `setSwapReferrer()` function for owner-only updates
- **Swap Integration**: All swap functions pass swapReferrer to pool contracts
- **Access Control**: Only router owner can change swap referrer address

### Key Design Decisions

#### Fee Calculation Hierarchy
1. **Protocol Fee**: Extracted first from swap fees
2. **Swap Referrer Fee**: Extracted from remaining fees after protocol fee
3. **LP Fee**: Remainder distributed to liquidity providers

#### Security Model
- **Factory Owner**: Controls swap referrer fee rates and router whitelist
- **Router Owner**: Controls swap referrer address for their router
- **Pool Validation**: Only whitelisted routers can claim swap referrer fees
- **Direct Transfer**: Immediate fee settlement for gas efficiency

#### Gas Optimization
- **Direct Transfer**: ~2,000 gas savings vs accumulate-then-collect pattern
- **Packed Storage**: Swap referrer fees packed in existing Slot0 structure
- **Efficient Validation**: O(1) router whitelist lookups
- **Minimal Overhead**: ~3% gas increase for swaps with swap referrer

### Implementation Status
- **Planning Phase**: Comprehensive implementation plans completed
- **Ready for Development**: All architectural decisions documented
- **Security Reviewed**: Access controls and validation patterns defined
- **Testing Strategy**: Unit and integration test plans included

### Security Considerations
- **Access Control**: Multi-layer security with factory owner, router owner, and pool validation
- **Router Whitelisting**: Prevents malicious routers from claiming swap referrer fees
- **Emergency Procedures**: Quick response mechanisms for security incidents
- **Audit Requirements**: All changes require security review before deployment

### Development Guidelines for Swap Referrer Fees
- Follow existing protocol fee patterns for consistency
- Use OpenZeppelin contracts for standard functionality (Ownable)
- Implement comprehensive test coverage for all fee scenarios
- Maintain gas efficiency - swap referrer fees should not significantly impact swap costs
- Ensure proper event emission for monitoring and analytics
- Consider upgrade paths and backwards compatibility