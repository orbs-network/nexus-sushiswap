// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interface/ISushiMasterChef.sol";
import "./base/SushiswapIntegration.sol";

/**
 * Staking contract for LiquidityNexusSushiLP
 */
contract LiquidityNexusStaking is ERC20("LiquidityNexusSushiLPStaking", "LNSLPStaking"), SushiswapIntegration {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public constant MASTERCHEF = address(0); //TODO
    address public constant LNSLP = address(0); // solhint-disable-line var-name-mixedcase
    uint256 public constant POOL_ID = 0; //TODO

    constructor() {
        IERC20(SLP).approve(MASTERCHEF, uint256(~0));
    }

    function stakeAll() external nonReentrant whenNotPaused {
        uint256 amount = balanceOf(msg.sender);

        IERC20(LNSLP).safeTransferFrom(msg.sender, address(this), amount);
        require(IERC20(SLP).balanceOf(address(this)) >= amount, "");

        IMasterChef(MASTERCHEF).deposit(POOL_ID, amount);
    }

    function unstakeAll() external nonReentrant whenNotPaused {
        (uint256 amount, ) = IMasterChef(MASTERCHEF).userInfo(POOL_ID, msg.sender); // TODO this might be more than sender deposited from here! maybe use minters[msg.sender].liquidity?
        IMasterChef(MASTERCHEF).withdraw(POOL_ID, amount);
        // TODO it appears this must be its own contract and ERC20 itself, separate from LNSLP, as we have no way of tracking staked shares in masterchef

        IERC20(LNSLP).safeTransfer(msg.sender, amount);
    }

    function claimRewards() external nonReentrant whenNotPaused {
        IMasterChef(MASTERCHEF).withdraw(POOL_ID, 0);
        // TODO
    }
}
