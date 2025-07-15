# Referrer Fee Implementation Plan for UniswapV3Pool

## Overview
This document outlines the implementation plan for adding a referrer fee system to the UniswapV3Pool contract. The referrer fee will be extracted from swap fees, similar to how protocol fees are currently handled.

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

## Proposed Referrer Fee System

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
    uint8 feeReferrer;  // NEW: referrer fee percentage (1/x format) - set by factory owner
    bool unlocked;
}
```

#### No additional storage needed
```solidity
// Referrer address comes from Router as swap parameter
// Fee percentage stored in Slot0, configured by factory owner
```

### 2. Interface Updates

#### Add to IUniswapV3PoolOwnerActions.sol
```solidity
function setFeeReferrer(uint8 feeReferrer0, uint8 feeReferrer1) external;
```

#### Add to IUniswapV3PoolActions.sol
```solidity
// Modify existing swap function signature to include referrer
function swap(
    address recipient,
    bool zeroForOne,
    int256 amountSpecified,
    uint160 sqrtPriceLimitX96,
    bytes calldata data,
    address referrer  // NEW: referrer address
) external returns (int256 amount0, int256 amount1);
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
    uint128 referrerFee;  // NEW: referrer fee for direct transfer
    uint128 liquidity;
}
```

#### Modify SwapCache struct (line 545)
```solidity
struct SwapCache {
    uint8 feeProtocol;
    uint8 feeReferrer;  // NEW: referrer fee percentage (from Slot0)
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

// Extract referrer fee from remaining amount
if (cache.feeReferrer > 0) {
    uint256 referrerDelta = step.feeAmount / cache.feeReferrer;
    step.feeAmount -= referrerDelta;
    state.referrerFee += uint128(referrerDelta);
}

// Remaining fee goes to liquidity providers
if (state.liquidity > 0)
    state.feeGrowthGlobalX128 += FullMath.mulDiv(step.feeAmount, FixedPoint128.Q128, state.liquidity);
```

### 4. New Functions Implementation

#### setFeeReferrer function
```solidity
function setFeeReferrer(uint8 feeReferrer0, uint8 feeReferrer1) external override lock onlyFactoryOwner {
    require(
        (feeReferrer0 == 0 || (feeReferrer0 >= 4 && feeReferrer0 <= 20)) &&
            (feeReferrer1 == 0 || (feeReferrer1 >= 4 && feeReferrer1 <= 20))
    );
    uint8 feeReferrerOld = slot0.feeReferrer;
    slot0.feeReferrer = feeReferrer0 + (feeReferrer1 << 4);
    emit SetFeeReferrer(feeReferrerOld % 16, feeReferrerOld >> 4, feeReferrer0, feeReferrer1);
}
```

#### Direct transfer logic in swap function
```solidity
// Add after fee growth global update (around line 757-765)
if (state.referrerFee > 0 && referrer != address(0)) {
    if (zeroForOne) {
        TransferHelper.safeTransfer(token0, referrer, state.referrerFee);
    } else {
        TransferHelper.safeTransfer(token1, referrer, state.referrerFee);
    }
    emit ReferrerFeeTransfer(referrer, zeroForOne ? state.referrerFee : 0, zeroForOne ? 0 : state.referrerFee);
}
```

### 5. Event Definitions

#### Add to interface
```solidity
event SetFeeReferrer(uint8 feeReferrer0Old, uint8 feeReferrer1Old, uint8 feeReferrer0New, uint8 feeReferrer1New);
event ReferrerFeeTransfer(address indexed referrer, uint128 amount0, uint128 amount1);
```

### 6. Flash Loan Integration

#### Update flash function (lines 800-831)
Apply similar referrer fee extraction logic to flash loan fees:
```solidity
if (paid0 > 0) {
    uint8 feeProtocol0 = slot0.feeProtocol % 16;
    uint8 feeReferrer0 = slot0.feeReferrer % 16;
    
    uint256 protocolFees0 = feeProtocol0 == 0 ? 0 : paid0 / feeProtocol0;
    uint256 referrerFees0 = feeReferrer0 == 0 ? 0 : (paid0 - protocolFees0) / feeReferrer0;
    
    if (uint128(protocolFees0) > 0) protocolFees.token0 += uint128(protocolFees0);
    if (uint128(referrerFees0) > 0 && referrer != address(0)) {
        TransferHelper.safeTransfer(token0, referrer, uint128(referrerFees0));
    }
    
    feeGrowthGlobal0X128 += FullMath.mulDiv(paid0 - protocolFees0 - referrerFees0, FixedPoint128.Q128, _liquidity);
}
```

## Implementation Steps

### Phase 1: Interface Updates
1. Update `IUniswapV3PoolActions.sol` interface (add referrer parameter to swap)
2. Update `IUniswapV3PoolOwnerActions.sol` interface (add setFeeReferrer)

### Phase 2: Storage and Struct Changes
1. Modify `Slot0` struct to include `feeReferrer`
2. Update `SwapState` and `SwapCache` structs

### Phase 3: Core Logic Implementation
1. Modify `swap()` function signature to include referrer parameter
2. Update fee calculation logic in swap loop
3. Add direct transfer logic after fee calculation

### Phase 4: Management Functions
1. Implement `setFeeReferrer()` function
2. Add necessary events

### Phase 5: Flash Loan Integration
1. Update `flash()` function to support referrer fees
2. Add referrer parameter to flash loan interface

### Phase 6: Testing and Validation
1. Write comprehensive unit tests
2. Test gas optimization scenarios
3. Validate fee calculation accuracy
4. Test edge cases (zero referrer, failed transfers)

## Security Considerations

1. **Access Control**: 
   - Only factory owner can set referrer fee rates
   - Direct transfer eliminates collection access control issues
2. **Fee Bounds**: Referrer fees should be limited (suggested: 4-20, meaning 1/4 to 1/20 of swap fee)
3. **Address Validation**: Validate referrer addresses to prevent zero address transfers
4. **Overflow Protection**: Ensure fee calculations don't cause arithmetic overflow
5. **Gas Optimization**: Direct transfer is more gas efficient than accumulate-then-collect pattern
6. **Transfer Safety**: Use TransferHelper.safeTransfer for all token transfers
7. **Referrer Validation**: Must check referrer != address(0) before transfer

## Gas Impact Analysis

- **Direct Transfer**: ~21,000 gas for token transfer (only when referrer fees > 0)
- **Computation**: Minimal additional arithmetic operations
- **Memory**: Slightly increased struct sizes
- **Storage**: No additional storage needed (eliminated SSTORE operations)
- **Overall Impact**: Expected ~3% gas increase for swaps with referrer, but more efficient than accumulate-then-collect pattern

## Backward Compatibility

- New referrer parameter in swap function breaks backward compatibility
- Consider implementing both old and new swap functions during transition period
- Factory contract may need updates to handle referrer fee configuration

## Fee Distribution Examples

### Example 1: 0.3% pool fee, 1/4 protocol fee, 1/10 referrer fee
- Total swap fee: 0.3%
- Protocol fee: 0.3% / 4 = 0.075%
- Referrer fee: (0.3% - 0.075%) / 10 = 0.0225%
- LP fee: 0.3% - 0.075% - 0.0225% = 0.2025%

### Example 2: 0.05% pool fee, no protocol fee, 1/20 referrer fee
- Total swap fee: 0.05%
- Protocol fee: 0%
- Referrer fee: 0.05% / 20 = 0.0025%
- LP fee: 0.05% - 0.0025% = 0.0475%

## Conclusion

This implementation plan provides a comprehensive approach to adding referrer fees to UniswapV3Pool while maintaining the existing fee structure and gas efficiency. The referrer fee system will incentivize user acquisition while preserving the protocol's economic model.