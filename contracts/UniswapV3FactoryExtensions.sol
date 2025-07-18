// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.7.6;

import './interfaces/IUniswapV3FactoryExtensions.sol';
import './interfaces/IUniswapV3FactoryCore.sol';

/// @title Uniswap V3 factory extensions
/// @notice Handles extended functionality like router whitelisting and referrer fees
contract UniswapV3FactoryExtensions is IUniswapV3FactoryExtensions {
    /// @inheritdoc IUniswapV3FactoryExtensions
    address public immutable override factoryCore;

    /// @notice Authorized wrapper contract address
    address public wrapper;

    /// @notice Mapping to track whitelisted routers
    /// @dev router address => is whitelisted
    mapping(address => bool) public whitelistedRouters;

    /// @notice Default swap referrer fee for newly created pools
    uint8 public override defaultSwapReferrerFee;

    /// @notice Pool swap referrer fee configurations
    mapping(address => uint8) public override poolSwapReferrerFees;

    /// @dev Modifier to restrict access to factory owner or authorized wrapper
    modifier onlyAuthorized() {
        require(msg.sender == IUniswapV3FactoryCore(factoryCore).owner() || msg.sender == wrapper, 'Only owner');
        _;
    }

    /// @notice Set the authorized wrapper contract
    /// @dev Can only be called by the factory owner
    /// @param _wrapper The wrapper contract address
    function setWrapper(address _wrapper) external {
        require(msg.sender == IUniswapV3FactoryCore(factoryCore).owner(), 'Only owner');
        wrapper = _wrapper;
    }

    constructor(address _factoryCore) {
        require(_factoryCore != address(0));
        factoryCore = _factoryCore;
    }

    /// @inheritdoc IUniswapV3FactoryExtensions
    function isRouterWhitelisted(address router) external view override returns (bool) {
        return whitelistedRouters[router];
    }

    /// @inheritdoc IUniswapV3FactoryExtensions
    function addRouterToWhitelist(address router) external override onlyAuthorized {
        require(router != address(0));
        require(!whitelistedRouters[router]);
        
        whitelistedRouters[router] = true;
        emit RouterWhitelisted(router, msg.sender);
    }

    /// @inheritdoc IUniswapV3FactoryExtensions
    function removeRouterFromWhitelist(address router) external override onlyAuthorized {
        require(router != address(0));
        require(whitelistedRouters[router]);
        
        whitelistedRouters[router] = false;
        emit RouterRemovedFromWhitelist(router, msg.sender);
    }

    /// @inheritdoc IUniswapV3FactoryExtensions
    function setDefaultSwapReferrerFee(uint8 _defaultSwapReferrerFee) external override onlyAuthorized {
        require(_defaultSwapReferrerFee == 0 || (_defaultSwapReferrerFee >= 4 && _defaultSwapReferrerFee <= 20));
        
        uint8 oldDefaultSwapReferrerFee = defaultSwapReferrerFee;
        defaultSwapReferrerFee = _defaultSwapReferrerFee;
        
        emit DefaultSwapReferrerFeeChanged(oldDefaultSwapReferrerFee, _defaultSwapReferrerFee);
    }

    /// @inheritdoc IUniswapV3FactoryExtensions
    function setPoolSwapReferrerFee(
        address pool,
        uint8 feeSwapReferrer0,
        uint8 feeSwapReferrer1
    ) external override onlyAuthorized {
        require(pool != address(0));
        require((feeSwapReferrer0 == 0 || (feeSwapReferrer0 >= 4 && feeSwapReferrer0 <= 20)) &&
                (feeSwapReferrer1 == 0 || (feeSwapReferrer1 >= 4 && feeSwapReferrer1 <= 20)));
        
        uint8 currentFee = poolSwapReferrerFees[pool];
        uint8 feeSwapReferrer0Old = currentFee % 16;
        uint8 feeSwapReferrer1Old = currentFee >> 4;
        
        poolSwapReferrerFees[pool] = feeSwapReferrer0 + (feeSwapReferrer1 << 4);
        
        emit PoolSwapReferrerFeeSet(pool, feeSwapReferrer0Old, feeSwapReferrer1Old, feeSwapReferrer0, feeSwapReferrer1);
    }
}