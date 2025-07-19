// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.7.6;
pragma abicoder v2;

import './LowGasSafeMath.sol';
import './FullMath.sol';
import './SafeCast.sol';
import './FixedPoint128.sol';

/// @title Uniswap V3 Pool Library
/// @notice Contains structs and functions to reduce pool contract size
library UniswapV3PoolLib {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;

    struct SwapCache {
        // the protocol fee for the input token
        uint8 feeProtocol;
        uint8 feeSwapReferrer;
        // liquidity at the beginning of the swap
        uint128 liquidityStart;
        // the timestamp of the current block
        uint32 blockTimestamp;
        // the current value of the tick accumulator, computed only if we cross an initialized tick
        int56 tickCumulative;
        // the current value of seconds per liquidity accumulator, computed only if we cross an initialized tick
        uint160 secondsPerLiquidityCumulativeX128;
        // whether we've computed and cached the above two accumulators
        bool computedLatestObservation;
    }

    // the top level state of the swap, the results of which are recorded in storage at the end
    struct SwapState {
        // the amount remaining to be swapped in/out of the input/output asset
        int256 amountSpecifiedRemaining;
        // the amount already swapped out/in of the output/input asset
        int256 amountCalculated;
        // current sqrt(price)
        uint160 sqrtPriceX96;
        // the tick associated with the current price
        int24 tick;
        // the global fee growth of the input token
        uint256 feeGrowthGlobalX128;
        // amount of input token paid as protocol fee
        uint128 protocolFee;
        uint128 swapReferrerFee;
        // the current liquidity in range
        uint128 liquidity;
    }

    struct StepComputations {
        // the price at the beginning of the step
        uint160 sqrtPriceStartX96;
        // the next tick to swap to from the current tick in the swap direction
        int24 tickNext;
        // whether tickNext is initialized or not
        bool initialized;
        // sqrt(price) for the next tick (1/0)
        uint160 sqrtPriceNextX96;
        // how much is being swapped in in this step
        uint256 amountIn;
        // how much is being swapped out
        uint256 amountOut;
        // how much fee is being paid in
        uint256 feeAmount;
    }

    /// @notice Calculates and applies protocol and swap referrer fees
    function applyFees(
        StepComputations memory step,
        SwapState memory state,
        SwapCache memory cache,
        bool isRouterWhitelisted
    ) external pure returns (StepComputations memory, SwapState memory) {
        // Extract protocol fees
        if (cache.feeProtocol > 0) {
            uint256 delta = step.feeAmount / cache.feeProtocol;
            step.feeAmount -= delta;
            state.protocolFee += uint128(delta);
        }
        
        // Extract swap referrer fees
        if (cache.feeSwapReferrer > 0) {
            uint256 refDelta = step.feeAmount / cache.feeSwapReferrer;
            step.feeAmount -= refDelta;
            if (isRouterWhitelisted) {
                state.swapReferrerFee += uint128(refDelta);
            } else {
                state.protocolFee += uint128(refDelta);
            }
        }
        
        return (step, state);
    }

    /// @notice Updates swap amounts based on swap direction
    function updateSwapAmounts(
        SwapState memory state,
        StepComputations memory step,
        bool exactInput
    ) external pure returns (SwapState memory) {
        if (exactInput) {
            state.amountSpecifiedRemaining -= (step.amountIn + step.feeAmount).toInt256();
            state.amountCalculated = state.amountCalculated.sub(step.amountOut.toInt256());
        } else {
            state.amountSpecifiedRemaining += step.amountOut.toInt256();
            state.amountCalculated = state.amountCalculated.add((step.amountIn + step.feeAmount).toInt256());
        }
        return state;
    }

    /// @notice Updates global fee growth
    function updateFeeGrowthGlobal(
        SwapState memory state,
        uint256 feeAmount,
        uint128 liquidity
    ) external pure returns (SwapState memory) {
        if (liquidity > 0) {
            state.feeGrowthGlobalX128 += FullMath.mulDiv(feeAmount, FixedPoint128.Q128, liquidity);
        }
        return state;
    }

    /// @notice Validates router whitelist and returns status
    function validateRouterWhitelist(
        address swapReferrer,
        address factory,
        address router
    ) external view returns (bool isRouterWhitelisted) {
        if (swapReferrer != address(0)) {
            // Using low-level call to avoid import dependencies
            (bool success, bytes memory data) = factory.staticcall(
                abi.encodeWithSignature("isRouterWhitelisted(address)", router)
            );
            if (success && data.length >= 32) {
                isRouterWhitelisted = abi.decode(data, (bool));
            }
        }
    }

    /// @notice Process a complete swap step with fee extraction and amount updates
    function processSwapStep(
        SwapState memory state,
        StepComputations memory step,
        SwapCache memory cache,
        bool exactInput,
        bool isRouterWhitelisted
    ) external pure returns (SwapState memory, StepComputations memory) {
        // Update amounts based on swap direction
        if (exactInput) {
            state.amountSpecifiedRemaining -= (step.amountIn + step.feeAmount).toInt256();
            state.amountCalculated = state.amountCalculated.sub(step.amountOut.toInt256());
        } else {
            state.amountSpecifiedRemaining += step.amountOut.toInt256();
            state.amountCalculated = state.amountCalculated.add((step.amountIn + step.feeAmount).toInt256());
        }
        
        // Apply fees
        if (cache.feeProtocol > 0) {
            uint256 delta = step.feeAmount / cache.feeProtocol;
            step.feeAmount -= delta;
            state.protocolFee += uint128(delta);
        }
        
        if (cache.feeSwapReferrer > 0) {
            uint256 refDelta = step.feeAmount / cache.feeSwapReferrer;
            step.feeAmount -= refDelta;
            if (isRouterWhitelisted) {
                state.swapReferrerFee += uint128(refDelta);
            } else {
                state.protocolFee += uint128(refDelta);
            }
        }
        
        // Update global fee growth
        if (state.liquidity > 0) {
            state.feeGrowthGlobalX128 += FullMath.mulDiv(step.feeAmount, FixedPoint128.Q128, state.liquidity);
        }
        
        return (state, step);
    }
}