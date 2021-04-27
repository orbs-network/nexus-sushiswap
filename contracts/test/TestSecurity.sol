// SPDX-License-Identifier: MIT
// solhint-disable not-rely-on-time
// solhint-disable no-empty-blocks
pragma solidity ^0.7.6;

import "./TestNexusBase.sol";
import "../interface/ISushiswapRouter.sol";
import "./flashloan/AaveFlashLoan.sol";
import "./flashloan/SushiswapFlashLoan.sol";

contract TestSecurity is TestNexusBase, AaveFlashLoan, SushiswapFlashLoan {
    using SafeERC20 for IERC20;

    constructor(NexusLPSushi uut) payable TestNexusBase(uut) SushiswapFlashLoan(uut.SLP(), uut.WETH()) {
        IERC20(WETH).safeApprove(nexus.ROUTER(), uint256(~0));
        IERC20(USDC).safeApprove(nexus.ROUTER(), uint256(~0));
        IERC20(WETH).safeApprove(nexus.SLP(), uint256(~0));
        IERC20(USDC).safeApprove(nexus.SLP(), uint256(~0));
        IERC20(WETH).safeApprove(address(nexus), uint256(~0));
    }

    function testWhaleExploitOnEntry() external {
        require(IERC20(USDC).balanceOf(address(this)) >= 100_000_000 * 1e6, "assume >= 100M USDC");
        // raise ETH price
        IUniswapV2Router02(nexus.ROUTER()).swapExactTokensForTokens(
            IERC20(USDC).balanceOf(address(this)),
            0,
            pathTo[WETH],
            address(this),
            DEADLINE
        );
        assertReverts("_testWhaleExploitOnEntryShouldRevert()");
    }

    function _testWhaleExploitOnEntryShouldRevert() external {
        console.log("price ETH", nexus.quote(1 ether));
        nexus.addLiquidity(address(this), nexus.availableSpaceToDepositETH(), DEADLINE); // PriceGuard reverts
    }

    function testWhaleExploitOnExit() external {
        nexus.addLiquidity(address(this), nexus.availableSpaceToDepositETH(), DEADLINE);
        // lower ETH price
        IUniswapV2Router02(nexus.ROUTER()).swapExactTokensForTokens(
            IERC20(WETH).balanceOf(address(this)),
            0,
            pathTo[USDC],
            address(this),
            DEADLINE
        );
        assertReverts("_testWhaleExploitOnExitShouldRevert()");
    }

    function _testWhaleExploitOnExitShouldRevert() external {
        nexus.removeAllLiquidity(address(this), DEADLINE); // PriceGuard reverts
    }
}
