// SPDX-License-Identifier: MIT
// solhint-disable not-rely-on-time
// solhint-disable no-empty-blocks
pragma solidity ^0.7.6;

import "./TestNexusBase.sol";
import "./flashloan/FlashLoanReceiver.sol";
import "../interface/ISushiswapRouter.sol";

contract TestSecurity is TestNexusBase, FlashLoanReceiver {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    constructor(NexusLPSushi uut) payable TestNexusBase(uut) {}

    function testFlashloanExploitOnEntry() external {
        takeFlashLoan(USDC, 50_000_000 * 1e6, "_executeFlashloanExploitOnEntry()");
    }

    function _executeFlashloanExploitOnEntry() public {
        uint256 interest = 45_000 * 1e6; // 0.09% flashloan fee
        IERC20(WETH).approve(nexus.ROUTER(), uint256(~0));
        IUniswapV2Router02(nexus.ROUTER()).swapTokensForExactTokens(
            interest,
            uint256(~0),
            pathTo[USDC],
            address(this),
            DEADLINE
        );
    }
}
