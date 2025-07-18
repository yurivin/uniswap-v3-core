# Uniswap V3 Fee Distribution Mechanism

## Overview
This document explains how Uniswap V3 determines which liquidity positions receive fees from swaps and how the fee distribution is calculated. The system uses a sophisticated mathematical approach to ensure fair and proportional fee distribution without requiring iteration through all positions.

## Core Concepts

### 1. Active Liquidity Concept

Only positions that have liquidity **active** during a swap receive fees. A position's liquidity is active when:
- The current price is within the position's tick range (`tickLower` ≤ current tick ≤ `tickUpper`)
- The position has non-zero liquidity

### 2. Proportional Fee Distribution

Fees are distributed proportionally to the amount of liquidity each position provides at the current price:

```
Position Fee Share = (Position Active Liquidity / Total Active Liquidity) × Total Swap Fees
```

## Technical Implementation

### 1. Fee Collection During Swaps

```solidity
// In UniswapV3Pool.sol - simplified fee distribution logic
function swap(...) external returns (int256 amount0, int256 amount1) {
    // ... swap logic ...
    
    // Calculate fees collected during swap
    uint256 feeAmount = amountSpecified * fee / 1000000;
    
    // Fees are distributed proportionally to active liquidity
    // Each position gets: (position_liquidity / total_active_liquidity) * total_fees
    
    // Update global fee growth trackers
    if (liquidity > 0) {
        feeGrowthGlobal0X128 += FullMath.mulDiv(feeAmount, FixedPoint128.Q128, liquidity);
    }
}
```

### 2. Position-Specific Fee Tracking

Each position tracks its share of accumulated fees using **fee growth tracking**:

```solidity
struct Position {
    uint128 liquidity;                 // Position's liquidity amount
    uint256 feeGrowthInside0LastX128;  // Checkpoint for token0 fees
    uint256 feeGrowthInside1LastX128;  // Checkpoint for token1 fees
    uint128 tokensOwed0;               // Accumulated fees token0
    uint128 tokensOwed1;               // Accumulated fees token1
    // ... other fields
}
```

### 3. Global Fee Growth Tracking

The pool maintains global fee growth per unit of liquidity:

```solidity
// Pool-level fee growth tracking
uint256 public feeGrowthGlobal0X128;  // Global fee growth for token0
uint256 public feeGrowthGlobal1X128;  // Global fee growth for token1

// Updated during each swap based on active liquidity
function updateFeeGrowth(uint256 feeAmount0, uint256 feeAmount1, uint128 totalActiveLiquidity) {
    if (totalActiveLiquidity > 0) {
        feeGrowthGlobal0X128 += (feeAmount0 * FixedPoint128.Q128) / totalActiveLiquidity;
        feeGrowthGlobal1X128 += (feeAmount1 * FixedPoint128.Q128) / totalActiveLiquidity;
    }
}
```

### 4. Position Fee Calculation

When position operations happen (mint, burn, collect), fees are calculated:

```solidity
function _updatePosition(address owner, int24 tickLower, int24 tickUpper, int128 liquidityDelta) {
    // Get fee growth inside the position's tick range
    (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128) = 
        _getFeeGrowthInside(tickLower, tickUpper);
    
    // Calculate fees owed since last update
    uint256 feesOwed0 = FullMath.mulDiv(
        feeGrowthInside0X128 - position.feeGrowthInside0LastX128,
        position.liquidity,
        FixedPoint128.Q128
    );
    
    uint256 feesOwed1 = FullMath.mulDiv(
        feeGrowthInside1X128 - position.feeGrowthInside1LastX128,
        position.liquidity,
        FixedPoint128.Q128
    );
    
    // Update position checkpoints
    position.feeGrowthInside0LastX128 = feeGrowthInside0X128;
    position.feeGrowthInside1LastX128 = feeGrowthInside1X128;
    
    // Accumulate fees owed
    position.tokensOwed0 += feesOwed0;
    position.tokensOwed1 += feesOwed1;
}
```

### 5. Tick-Based Fee Growth Tracking

```solidity
struct Tick {
    uint128 liquidityGross;            // Total liquidity at this tick
    int128 liquidityNet;               // Net liquidity change at this tick
    uint256 feeGrowthOutside0X128;     // Fee growth outside this tick (token0)
    uint256 feeGrowthOutside1X128;     // Fee growth outside this tick (token1)
    // ... other fields
}

// Calculate fee growth inside a tick range
function _getFeeGrowthInside(int24 tickLower, int24 tickUpper) 
    private view returns (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128) {
    
    // Get fee growth data for boundary ticks
    uint256 feeGrowthBelow0X128;
    uint256 feeGrowthBelow1X128;
    uint256 feeGrowthAbove0X128;
    uint256 feeGrowthAbove1X128;
    
    // Complex calculation using tick boundaries
    // Determines how much fee growth occurred within the position's range
    
    if (tickCurrent < tickLower) {
        // Current price is below the position range
        feeGrowthInside0X128 = feeGrowthBelow0X128 - feeGrowthAbove0X128;
        feeGrowthInside1X128 = feeGrowthBelow1X128 - feeGrowthAbove1X128;
    } else if (tickCurrent < tickUpper) {
        // Current price is within the position range
        feeGrowthInside0X128 = feeGrowthGlobal0X128 - feeGrowthBelow0X128 - feeGrowthAbove0X128;
        feeGrowthInside1X128 = feeGrowthGlobal1X128 - feeGrowthBelow1X128 - feeGrowthAbove1X128;
    } else {
        // Current price is above the position range
        feeGrowthInside0X128 = feeGrowthAbove0X128 - feeGrowthBelow0X128;
        feeGrowthInside1X128 = feeGrowthAbove1X128 - feeGrowthBelow1X128;
    }
}
```

## Example: Fee Distribution Scenario

### Pool Setup
- **Pool**: USDC/ETH with 0.3% fee
- **Current Price**: $1900
- **Active Positions**:
  - Position A: 1000 USDC liquidity, range $1500-$2000
  - Position B: 500 USDC liquidity, range $1800-$2200  
  - Position C: 2000 USDC liquidity, range $1900-$2500

### Swap Scenario 1: Price at $1900
All positions are active (price within all ranges):

1. **Total Active Liquidity**: 1000 + 500 + 2000 = 3500 USDC
2. **Swap Fee Collected**: $10
3. **Fee Distribution**:
   - Position A: (1000/3500) × $10 = $2.86
   - Position B: (500/3500) × $10 = $1.43  
   - Position C: (2000/3500) × $10 = $5.71

### Swap Scenario 2: Price Moves to $2100
Position A becomes inactive (price above its range):

1. **Total Active Liquidity**: 0 + 500 + 2000 = 2500 USDC
2. **Swap Fee Collected**: $10
3. **Fee Distribution**:
   - Position A: $0 (inactive)
   - Position B: (500/2500) × $10 = $2.00
   - Position C: (2000/2500) × $10 = $8.00

### Swap Scenario 3: Price Moves to $1400
All positions become inactive (price below all ranges):

1. **Total Active Liquidity**: 0 USDC
2. **Swap Fee Collected**: $10
3. **Fee Distribution**:
   - Position A: $0 (inactive)
   - Position B: $0 (inactive)
   - Position C: $0 (inactive)
   - Fees accumulate in the pool until liquidity becomes active again

## Mathematical Precision

### Fixed-Point Arithmetic
Uniswap V3 uses 128-bit fixed-point arithmetic for precise fee calculations:

```solidity
// FixedPoint128 library
uint256 internal constant Q128 = 0x100000000000000000000000000000000; // 2^128

// Fee growth calculation
feeGrowthGlobal0X128 += FullMath.mulDiv(feeAmount, Q128, liquidity);
```

### Precision Benefits
- **Accuracy**: Handles very small fee amounts without rounding errors
- **Consistency**: Ensures deterministic calculations across all operations
- **Efficiency**: Avoids floating-point arithmetic in smart contracts

## Key Advantages

### 1. Automatic Distribution
- No manual intervention required
- Fees are distributed automatically during swaps
- No central authority controls fee allocation

### 2. Gas Efficiency
- Doesn't iterate through all positions
- Uses mathematical formulas for O(1) calculations
- Minimal gas overhead for fee distribution

### 3. Fairness
- Proportional to liquidity contribution
- Only active liquidity receives fees
- Transparent and predictable algorithm

### 4. Precision
- Uses 128-bit fixed-point arithmetic
- Handles micro-amounts accurately
- Prevents rounding errors and loss of value

## Fee Collection Process

### 1. Fee Accumulation
Fees accumulate in the position's `tokensOwed0` and `tokensOwed1` fields automatically as swaps occur.

### 2. Fee Collection
Position owners can collect accumulated fees using the `collect()` function:

```solidity
function collect(CollectParams calldata params) external returns (uint256 amount0, uint256 amount1) {
    // Update position to calculate latest fees
    _updatePosition(owner, tickLower, tickUpper, 0);
    
    // Transfer accumulated fees to recipient
    amount0 = params.amount0Max >= tokensOwed0 ? tokensOwed0 : params.amount0Max;
    amount1 = params.amount1Max >= tokensOwed1 ? tokensOwed1 : params.amount1Max;
    
    // Update position state
    position.tokensOwed0 -= amount0;
    position.tokensOwed1 -= amount1;
    
    // Transfer tokens
    if (amount0 > 0) TransferHelper.safeTransfer(token0, params.recipient, amount0);
    if (amount1 > 0) TransferHelper.safeTransfer(token1, params.recipient, amount1);
}
```

### 3. Partial Collection
Position owners can collect fees partially, leaving some fees in the position for future collection.

## Protocol Fee Integration

### 1. Protocol Fee Extraction
Before distributing fees to liquidity providers, the protocol extracts its fee:

```solidity
function _extractProtocolFee(uint256 amount0, uint256 amount1) internal returns (uint256, uint256) {
    uint256 protocolFee0 = amount0 * feeProtocol0 / 255;
    uint256 protocolFee1 = amount1 * feeProtocol1 / 255;
    
    // Accumulate protocol fees
    protocolFees.token0 += protocolFee0;
    protocolFees.token1 += protocolFee1;
    
    // Return remaining fees for liquidity providers
    return (amount0 - protocolFee0, amount1 - protocolFee1);
}
```

### 2. Fee Hierarchy
1. **Protocol Fee**: Extracted first (0-1/255 of total fees)
2. **Liquidity Provider Fees**: Remaining fees distributed to positions
3. **Referrer Fees**: Can be extracted from LP fees (if implemented)

## Implications for Position Managers

### 1. Fee Tracking
Position managers need to track:
- Which positions are active at current prices
- Fee accumulation rates for different price ranges
- Optimal timing for fee collection

### 2. Range Strategy
- **Narrow Ranges**: Higher fee rates when active, but inactive more often
- **Wide Ranges**: Lower fee rates when active, but active more often
- **Strategic Positioning**: Balance between fee earning and impermanent loss

### 3. Fee Optimization
- Monitor fee accumulation patterns
- Adjust position ranges based on trading activity
- Consider fee collection timing and gas costs

## Conclusion

The Uniswap V3 fee distribution mechanism is a sophisticated system that:

1. **Automatically** distributes fees proportionally to active liquidity
2. **Efficiently** calculates fees without iterating through positions
3. **Precisely** handles micro-amounts using fixed-point arithmetic
4. **Fairly** rewards liquidity providers based on their contribution
5. **Transparently** operates without central control

This system ensures that liquidity providers are fairly compensated for providing liquidity at the current market price, creating strong incentives for efficient price discovery and tight spreads in Uniswap V3 pools.

## References

- [Uniswap V3 Core Whitepaper](https://uniswap.org/whitepaper-v3.pdf)
- [Uniswap V3 Core Repository](https://github.com/Uniswap/uniswap-v3-core)
- [FixedPoint128 Library](https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/FixedPoint128.sol)
- [FullMath Library](https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/FullMath.sol)