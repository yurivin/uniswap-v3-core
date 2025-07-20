// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title Permissioned pool actions
/// @notice Contains pool methods that may only be called by the factory owner
interface IUniswapV3PoolOwnerActions {
    /// @notice Set the denominator of the protocol's % share of the fees
    /// @param feeProtocol0 new protocol fee for token0 of the pool
    /// @param feeProtocol1 new protocol fee for token1 of the pool
    function setFeeProtocol(uint8 feeProtocol0, uint8 feeProtocol1) external;

    /// @notice Collect the protocol fee accrued to the pool
    /// @param recipient The address to which collected protocol fees should be sent
    /// @param amount0Requested The maximum amount of token0 to send, can be 0 to collect fees in only token1
    /// @param amount1Requested The maximum amount of token1 to send, can be 0 to collect fees in only token0
    /// @return amount0 The protocol fee collected in token0
    /// @return amount1 The protocol fee collected in token1
    function collectProtocol(
        address recipient,
        uint128 amount0Requested,
        uint128 amount1Requested
    ) external returns (uint128 amount0, uint128 amount1);

    /// @notice Set the denominator of the swap referrer's % share of the fees
    /// @dev Can only be called by the factory owner
    /// @dev feeSwapReferrer0 and feeSwapReferrer1 must be 0 or between 4 and 15 (same as protocol fees)
    /// @param feeSwapReferrer0 new swap referrer fee for token0 of the pool (0 or 4-15)
    /// @param feeSwapReferrer1 new swap referrer fee for token1 of the pool (0 or 4-15)
    function setFeeSwapReferrer(uint8 feeSwapReferrer0, uint8 feeSwapReferrer1) external;
}
