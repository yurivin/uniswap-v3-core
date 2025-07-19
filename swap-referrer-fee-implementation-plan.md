# Swap Referrer Fee Implementation Plan for UniswapV3Pool

## Overview
This document outlines the implementation plan for adding a swap referrer fee system to the UniswapV3Pool contract. The swap referrer fee will be extracted from swap fees, similar to how protocol fees are currently handled.

## Current Fee Structure Analysis

### Existing Fee Flow
1. **Total Swap Fee**: Calculated in `SwapMath.computeSwapStep()` based on pool's `fee` parameter
2. **Protocol Fee**: Extracted from swap fee based on `feeProtocol` percentage (1/x format)
3. **LP Fee**: Remaining fee amount distributed to liquidity providers via `feeGrowthGlobalX128`

### Current Fee Calculation (lines 681-690)
```solidity
if (cache.feeProtocol > 0) {
    uint256 delta = step.feeAmount / cache.feeProtocol;
    step.feeAmount -= delta;
    state.protocolFee += uint128(delta);
}

if (state.liquidity > 0)
    state.feeGrowthGlobalX128 += FullMath.mulDiv(step.feeAmount, FixedPoint128.Q128, state.liquidity);
```

## Proposed Swap Referrer Fee System

### 1. Storage Changes

#### Add to Slot0 struct (line 56)
```solidity
struct Slot0 {
    uint160 sqrtPriceX96;
    int24 tick;
    uint16 observationIndex;
    uint16 observationCardinality;
    uint16 observationCardinalityNext;
    uint8 feeProtocol;
    uint8 feeSwapReferrer;  // NEW: swap referrer fee percentage (1/x format) - set by factory owner
    bool unlocked;
}
```

#### No additional storage needed
```solidity
// Swap referrer address comes from Router as swap parameter
// Fee percentage stored in Slot0, configured by factory owner
```

### 2. Interface Updates

#### Add to IUniswapV3PoolOwnerActions.sol
```solidity
function setFeeSwapReferrer(uint8 feeSwapReferrer0, uint8 feeSwapReferrer1) external;
```

#### Add SwapParams struct to IUniswapV3PoolActions.sol
```solidity
/// @notice Parameters for the swap function
struct SwapParams {
    address recipient;           // Address to receive output tokens
    bool zeroForOne;            // Direction: true = token0->token1, false = token1->token0  
    int256 amountSpecified;     // Amount: positive = exact input, negative = exact output
    uint160 sqrtPriceLimitX96;  // Price limit as Q64.96 sqrt price
    address swapReferrer;       // Referrer address for fee collection (can be address(0))
    bytes data;                 // Callback data
}

/// @notice Swap token0 for token1, or token1 for token0
/// @dev The caller of this method receives a callback in the form of IUniswapV3SwapCallback#uniswapV3SwapCallback
/// @param params The swap parameters encapsulated in SwapParams struct
/// @return amount0 The delta of the balance of token0 of the pool, exact when negative, minimum when positive
/// @return amount1 The delta of the balance of token1 of the pool, exact when negative, minimum when positive
function swap(SwapParams calldata params) external returns (int256 amount0, int256 amount1);
```

### 3. Core Implementation Changes

#### Modify SwapState struct (line 561)
```solidity
struct SwapState {
    int256 amountSpecifiedRemaining;
    int256 amountCalculated;
    uint160 sqrtPriceX96;
    int24 tick;
    uint256 feeGrowthGlobalX128;
    uint128 protocolFee;
    uint128 swapReferrerFee;  // NEW: swap referrer fee for direct transfer
    uint128 liquidity;
}
```

#### Modify SwapCache struct (line 545)
```solidity
struct SwapCache {
    uint8 feeProtocol;
    uint8 feeSwapReferrer;  // NEW: swap referrer fee percentage (from Slot0)
    uint128 liquidityStart;
    uint32 blockTimestamp;
    int56 tickCumulative;
    uint160 secondsPerLiquidityCumulativeX128;
    bool computedLatestObservation;
}
```

#### Update fee calculation logic (lines 681-690)
```solidity
// Extract protocol fee first
if (cache.feeProtocol > 0) {
    uint256 protocolDelta = step.feeAmount / cache.feeProtocol;
    step.feeAmount -= protocolDelta;
    state.protocolFee += uint128(protocolDelta);
}

// Extract swap referrer fee from remaining amount
if (cache.feeSwapReferrer > 0) {
    uint256 swapReferrerDelta = step.feeAmount / cache.feeSwapReferrer;
    step.feeAmount -= swapReferrerDelta;
    state.swapReferrerFee += uint128(swapReferrerDelta);
}

// Remaining fee goes to liquidity providers
if (state.liquidity > 0)
    state.feeGrowthGlobalX128 += FullMath.mulDiv(step.feeAmount, FixedPoint128.Q128, state.liquidity);
```

### 4. New Functions Implementation

#### setFeeSwapReferrer function
```solidity
function setFeeSwapReferrer(uint8 feeSwapReferrer0, uint8 feeSwapReferrer1) external override lock onlyFactoryOwner {
    require(
        (feeSwapReferrer0 == 0 || (feeSwapReferrer0 >= 4 && feeSwapReferrer0 <= 20)) &&
            (feeSwapReferrer1 == 0 || (feeSwapReferrer1 >= 4 && feeSwapReferrer1 <= 20))
    );
    uint8 feeSwapReferrerOld = slot0.feeSwapReferrer;
    slot0.feeSwapReferrer = feeSwapReferrer0 + (feeSwapReferrer1 << 4);
    emit SetFeeSwapReferrer(feeSwapReferrerOld % 16, feeSwapReferrerOld >> 4, feeSwapReferrer0, feeSwapReferrer1);
}
```

#### Direct transfer logic in swap function
```solidity
// Add after fee growth global update (around line 757-765)
if (state.swapReferrerFee > 0 && params.swapReferrer != address(0)) {
    if (params.zeroForOne) {
        TransferHelper.safeTransfer(token0, params.swapReferrer, state.swapReferrerFee);
    } else {
        TransferHelper.safeTransfer(token1, params.swapReferrer, state.swapReferrerFee);
    }
    emit SwapReferrerFeeTransfer(params.swapReferrer, params.zeroForOne ? state.swapReferrerFee : 0, params.zeroForOne ? 0 : state.swapReferrerFee);
}
```

### 5. Event Definitions

#### Add to interface
```solidity
event SetFeeSwapReferrer(uint8 feeSwapReferrer0Old, uint8 feeSwapReferrer1Old, uint8 feeSwapReferrer0New, uint8 feeSwapReferrer1New);
event SwapReferrerFeeTransfer(address indexed swapReferrer, uint128 amount0, uint128 amount1);
```

### 6. Flash Loan Integration

#### Update flash function (lines 800-831)
Apply similar swap referrer fee extraction logic to flash loan fees:
```solidity
if (paid0 > 0) {
    uint8 feeProtocol0 = slot0.feeProtocol % 16;
    uint8 feeSwapReferrer0 = slot0.feeSwapReferrer % 16;
    
    uint256 protocolFees0 = feeProtocol0 == 0 ? 0 : paid0 / feeProtocol0;
    uint256 swapReferrerFees0 = feeSwapReferrer0 == 0 ? 0 : (paid0 - protocolFees0) / feeSwapReferrer0;
    
    if (uint128(protocolFees0) > 0) protocolFees.token0 += uint128(protocolFees0);
    if (uint128(swapReferrerFees0) > 0 && params.swapReferrer != address(0)) {
        TransferHelper.safeTransfer(token0, params.swapReferrer, uint128(swapReferrerFees0));
    }
    
    feeGrowthGlobal0X128 += FullMath.mulDiv(paid0 - protocolFees0 - swapReferrerFees0, FixedPoint128.Q128, _liquidity);
}
```

## Implementation Steps

### Phase 1: Interface Updates
1. Update `IUniswapV3PoolActions.sol` interface (add referrer parameter to swap)
2. Update `IUniswapV3PoolOwnerActions.sol` interface (add setFeeReferrer)

### Phase 2: Storage and Struct Changes
1. Modify `Slot0` struct to include `feeSwapReferrer`
2. Update `SwapState` and `SwapCache` structs

### Phase 3: Core Logic Implementation
1. Modify `swap()` function signature to use SwapParams struct with swapReferrer parameter
2. Update fee calculation logic in swap loop
3. Add direct transfer logic after fee calculation

### Phase 4: Management Functions
1. Implement `setFeeSwapReferrer()` function
2. Add necessary events

### Phase 5: Flash Loan Integration
1. Update `flash()` function to support swap referrer fees
2. Add swap referrer parameter to flash loan interface

### Phase 6: Testing and Validation
1. Write comprehensive unit tests
2. Test gas optimization scenarios
3. Validate fee calculation accuracy
4. Test edge cases (zero referrer, failed transfers)

## Security Considerations

1. **Access Control**: 
   - Only factory owner can set referrer fee rates
   - Direct transfer eliminates collection access control issues
2. **Fee Bounds**: Swap referrer fees should be limited (suggested: 4-20, meaning 1/4 to 1/20 of swap fee)
3. **Address Validation**: Validate swap referrer addresses to prevent zero address transfers
4. **Overflow Protection**: Ensure fee calculations don't cause arithmetic overflow
5. **Gas Optimization**: Direct transfer is more gas efficient than accumulate-then-collect pattern
6. **Transfer Safety**: Use TransferHelper.safeTransfer for all token transfers
7. **Swap Referrer Validation**: Must check params.swapReferrer != address(0) before transfer

## Gas Impact Analysis

- **Direct Transfer**: ~21,000 gas for token transfer (only when swap referrer fees > 0)
- **Computation**: Minimal additional arithmetic operations
- **Memory**: Slightly increased struct sizes
- **Storage**: No additional storage needed (eliminated SSTORE operations)
- **Overall Impact**: Expected ~3% gas increase for swaps with swap referrer, but more efficient than accumulate-then-collect pattern

## Backward Compatibility

- New SwapParams struct in swap function breaks backward compatibility
- Consider implementing both old and new swap functions during transition period
- Factory contract may need updates to handle swap referrer fee configuration

## Fee Distribution Examples

### Example 1: 0.3% pool fee, 1/4 protocol fee, 1/10 swap referrer fee
- Total swap fee: 0.3%
- Protocol fee: 0.3% / 4 = 0.075%
- Swap referrer fee: (0.3% - 0.075%) / 10 = 0.0225%
- LP fee: 0.3% - 0.075% - 0.0225% = 0.2025%

### Example 2: 0.05% pool fee, no protocol fee, 1/20 swap referrer fee
- Total swap fee: 0.05%
- Protocol fee: 0%
- Swap referrer fee: 0.05% / 20 = 0.0025%
- LP fee: 0.05% - 0.0025% = 0.0475%

## Conclusion

This implementation plan provides a comprehensive approach to adding swap referrer fees to UniswapV3Pool while maintaining the existing fee structure and gas efficiency. The swap referrer fee system will incentivize user acquisition while preserving the protocol's economic model.