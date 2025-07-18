// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title The interface for the Uniswap V3 Factory Extensions
/// @notice The Uniswap V3 Factory Extensions handles extended functionality like router whitelisting and referrer fees
interface IUniswapV3FactoryExtensions {
    /// @notice Emitted when a router is added to the whitelist
    /// @param router The router address that was whitelisted
    /// @param caller The address that added the router
    event RouterWhitelisted(address indexed router, address indexed caller);

    /// @notice Emitted when a router is removed from the whitelist
    /// @param router The router address that was removed
    /// @param caller The address that removed the router
    event RouterRemovedFromWhitelist(address indexed router, address indexed caller);

    /// @notice Emitted when the default swap referrer fee is changed
    /// @param oldDefaultSwapReferrerFee The previous default swap referrer fee
    /// @param newDefaultSwapReferrerFee The new default swap referrer fee
    event DefaultSwapReferrerFeeChanged(uint8 oldDefaultSwapReferrerFee, uint8 newDefaultSwapReferrerFee);

    /// @notice Emitted when a pool's swap referrer fee is set
    /// @param pool The pool address
    /// @param feeSwapReferrer0Old The previous swap referrer fee for token0
    /// @param feeSwapReferrer1Old The previous swap referrer fee for token1
    /// @param feeSwapReferrer0New The new swap referrer fee for token0
    /// @param feeSwapReferrer1New The new swap referrer fee for token1
    event PoolSwapReferrerFeeSet(
        address indexed pool,
        uint8 feeSwapReferrer0Old,
        uint8 feeSwapReferrer1Old,
        uint8 feeSwapReferrer0New,
        uint8 feeSwapReferrer1New
    );

    /// @notice Returns the factory core contract address
    /// @return The address of the factory core contract
    function factoryCore() external view returns (address);

    /// @notice Returns whether a router is whitelisted
    /// @param router The router address to check
    /// @return True if the router is whitelisted
    function isRouterWhitelisted(address router) external view returns (bool);

    /// @notice Adds a router to the whitelist
    /// @dev Can only be called by the factory owner
    /// @param router The router address to whitelist
    function addRouterToWhitelist(address router) external;

    /// @notice Removes a router from the whitelist
    /// @dev Can only be called by the factory owner
    /// @param router The router address to remove
    function removeRouterFromWhitelist(address router) external;

    /// @notice Returns the default swap referrer fee for newly created pools
    /// @return The default swap referrer fee configuration
    function defaultSwapReferrerFee() external view returns (uint8);

    /// @notice Returns the swap referrer fee configuration for a specific pool
    /// @param pool The pool address
    /// @return The swap referrer fee configuration (feeSwapReferrer0 + (feeSwapReferrer1 << 4))
    function poolSwapReferrerFees(address pool) external view returns (uint8);

    /// @notice Sets the default swap referrer fee for newly created pools
    /// @dev Can only be called by the factory owner
    /// @param _defaultSwapReferrerFee The new default swap referrer fee
    function setDefaultSwapReferrerFee(uint8 _defaultSwapReferrerFee) external;

    /// @notice Sets the swap referrer fee for a specific pool
    /// @dev Can only be called by the factory owner
    /// @param pool The pool address
    /// @param feeSwapReferrer0 The swap referrer fee for token0 (0 or 4-20)
    /// @param feeSwapReferrer1 The swap referrer fee for token1 (0 or 4-20)
    function setPoolSwapReferrerFee(address pool, uint8 feeSwapReferrer0, uint8 feeSwapReferrer1) external;
}