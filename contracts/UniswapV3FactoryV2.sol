// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.7.6;

import './interfaces/IUniswapV3Factory.sol';
import './interfaces/IUniswapV3FactoryCore.sol';
import './interfaces/IUniswapV3FactoryExtensions.sol';

/// @title Uniswap V3 Factory V2 - Backward Compatible Wrapper
/// @notice Provides backward compatibility with the original IUniswapV3Factory interface
/// @dev Delegates calls to Core and Extensions contracts
contract UniswapV3FactoryV2 is IUniswapV3Factory {
    /// @notice The core factory contract
    IUniswapV3FactoryCore public immutable factoryCore;
    
    /// @notice The extensions contract
    IUniswapV3FactoryExtensions public immutable factoryExtensions;

    constructor(address _factoryCore, address _factoryExtensions) {
        require(_factoryCore != address(0) && _factoryExtensions != address(0));
        factoryCore = IUniswapV3FactoryCore(_factoryCore);
        factoryExtensions = IUniswapV3FactoryExtensions(_factoryExtensions);
    }

    /// @inheritdoc IUniswapV3Factory
    function owner() external view override returns (address) {
        return factoryCore.owner();
    }

    /// @inheritdoc IUniswapV3Factory
    function feeAmountTickSpacing(uint24 fee) external view override returns (int24) {
        return factoryCore.feeAmountTickSpacing(fee);
    }

    /// @inheritdoc IUniswapV3Factory
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view override returns (address pool) {
        return factoryCore.getPool(tokenA, tokenB, fee);
    }

    /// @inheritdoc IUniswapV3Factory
    function createPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external override returns (address pool) {
        return factoryCore.createPool(tokenA, tokenB, fee);
    }

    /// @inheritdoc IUniswapV3Factory
    function setOwner(address _owner) external override {
        factoryExtensions.setOwnerViaWrapper(_owner, msg.sender);
    }

    /// @inheritdoc IUniswapV3Factory
    function enableFeeAmount(uint24 fee, int24 tickSpacing) external override {
        factoryCore.enableFeeAmount(fee, tickSpacing);
    }

    /// @inheritdoc IUniswapV3Factory
    function isRouterWhitelisted(address router) external view override returns (bool) {
        return factoryExtensions.isRouterWhitelisted(router);
    }

    /// @inheritdoc IUniswapV3Factory
    function addRouterToWhitelist(address router) external override {
        require(msg.sender == factoryCore.owner());
        factoryExtensions.addRouterToWhitelist(router);
        emit RouterWhitelisted(router, msg.sender);
    }

    /// @inheritdoc IUniswapV3Factory
    function removeRouterFromWhitelist(address router) external override {
        require(msg.sender == factoryCore.owner());
        factoryExtensions.removeRouterFromWhitelist(router);
        emit RouterRemovedFromWhitelist(router, msg.sender);
    }
}