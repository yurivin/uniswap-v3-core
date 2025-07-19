// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.7.6;

import './interfaces/IUniswapV3FactoryCore.sol';

import './UniswapV3PoolDeployer.sol';
import './NoDelegateCall.sol';

import './UniswapV3Pool.sol';

/// @title Canonical Uniswap V3 factory core
/// @notice Deploys Uniswap V3 pools and manages core functionality
contract UniswapV3FactoryCore is IUniswapV3FactoryCore, UniswapV3PoolDeployer, NoDelegateCall {
    /// @inheritdoc IUniswapV3FactoryCore
    address public override owner;

    /// @inheritdoc IUniswapV3FactoryCore
    address public override extensions;

    /// @inheritdoc IUniswapV3FactoryCore
    mapping(uint24 => int24) public override feeAmountTickSpacing;
    /// @inheritdoc IUniswapV3FactoryCore
    mapping(address => mapping(address => mapping(uint24 => address))) public override getPool;

    /// @dev Modifier to restrict access to owner or extensions contract
    modifier onlyAuthorized() {
        require(msg.sender == owner || msg.sender == extensions);
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnerChanged(address(0), msg.sender);

        feeAmountTickSpacing[500] = 10;
        emit FeeAmountEnabled(500, 10);
        feeAmountTickSpacing[3000] = 60;
        emit FeeAmountEnabled(3000, 60);
        feeAmountTickSpacing[10000] = 200;
        emit FeeAmountEnabled(10000, 200);
    }

    /// @inheritdoc IUniswapV3FactoryCore
    function createPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external override noDelegateCall returns (address pool) {
        require(tokenA != tokenB);
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0));
        int24 tickSpacing = feeAmountTickSpacing[fee];
        require(tickSpacing != 0);
        require(getPool[token0][token1][fee] == address(0));
        pool = deploy(address(this), token0, token1, fee, tickSpacing);
        getPool[token0][token1][fee] = pool;
        // populate mapping in the reverse direction, deliberate choice to avoid the cost of comparing addresses
        getPool[token1][token0][fee] = pool;
        emit PoolCreated(token0, token1, fee, tickSpacing, pool);
    }

    /// @inheritdoc IUniswapV3FactoryCore
    function setOwner(address _owner) external override {
        require(msg.sender == owner);
        emit OwnerChanged(owner, _owner);
        owner = _owner;
    }
    
    /// @notice Set the owner via authorized contracts (extensions, wrapper)
    /// @param _owner The new owner address
    /// @param _caller The original caller who initiated this change
    function setOwnerAuthorized(address _owner, address _caller) external override onlyAuthorized {
        require(_caller == owner);
        emit OwnerChanged(owner, _owner);
        owner = _owner;
    }

    /// @inheritdoc IUniswapV3FactoryCore
    function setExtensions(address _extensions) external override {
        require(msg.sender == owner);
        emit ExtensionsUpdated(extensions, _extensions);
        extensions = _extensions;
    }

    /// @inheritdoc IUniswapV3FactoryCore
    function enableFeeAmount(uint24 fee, int24 tickSpacing) external override onlyAuthorized {
        require(fee < 1000000);
        // tick spacing is capped at 16384 to prevent the situation where tickSpacing is so large that
        // TickBitmap#nextInitializedTickWithinOneWord overflows int24 container from a valid tick
        // 16384 ticks represents a >5x price change with ticks of 1 bips
        require(tickSpacing > 0 && tickSpacing < 16384);
        require(feeAmountTickSpacing[fee] == 0);

        feeAmountTickSpacing[fee] = tickSpacing;
        emit FeeAmountEnabled(fee, tickSpacing);
    }
}