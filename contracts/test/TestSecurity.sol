// SPDX-License-Identifier: MIT
// solhint-disable not-rely-on-time
// solhint-disable no-empty-blocks
pragma solidity ^0.7.6;

import "./TestNexusBase.sol";
import "../interface/ISushiswapRouter.sol";
import "./flashloan/AaveFlashLoanReceiver.sol";
import "./flashloan/IUniswapFlashLoan.sol";

contract TestSecurity is TestNexusBase, AaveFlashLoanReceiver, IUniswapV2FlashloanReceiver {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    constructor(NexusLPSushi uut) payable TestNexusBase(uut) {
        IERC20(WETH).safeApprove(nexus.ROUTER(), uint256(~0));
        IERC20(USDC).safeApprove(nexus.ROUTER(), uint256(~0));
        IERC20(WETH).safeApprove(nexus.SLP(), uint256(~0));
        IERC20(USDC).safeApprove(nexus.SLP(), uint256(~0));
        IERC20(WETH).safeApprove(address(nexus), uint256(~0));
    }

    function testFlashloanExploitOnEntry() external {
        //        aaveFlashLoan(USDC, 40_000_000 * 1e6, "_executeFlashloanExploitOnEntry()");

        IUniswapV2Pair pair = IUniswapV2Pair(nexus.SLP());
        (uint112 rUSDC, uint112 rETH, ) = pair.getReserves();
        uint256 repayETH = IUniswapV2Router02(nexus.ROUTER()).getAmountIn(190_000_000 * 1e6, rETH, rUSDC);
        pair.swap(190_000_000 * 1e6, 0, address(this), abi.encode(repayETH));
    }

    function uniswapV2Call(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external override {
        printBalances("after uniswap loan", address(this));
        uint256 repayETH = abi.decode(data, (uint256));


        IERC20(WETH).transfer(nexus.SLP(), repayETH);
    }

    function _executeFlashloanExploitOnEntry() public {
        _dumpAllUSDC();

        nexus.addLiquidity(address(this), nexus.availableSpaceToDepositETH(), DEADLINE);
        printBalances("after add liquidity", address(this));

        uint256 loanUSDC = 40_000_000 * 1e6;
        uint256 repayUSDC = loanUSDC + interestForAmount(loanUSDC);

        console.log("repayUSDC", repayUSDC / 1e6);
        IUniswapV2Pair pair =
            IUniswapV2Pair(IUniswapV2Factory(IUniswapV2Router02(nexus.ROUTER()).factory()).getPair(WETH, USDC));
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        console.log("inETH", IUniswapV2Router02(nexus.ROUTER()).getAmountIn(repayUSDC, reserve1, reserve0) / 1 ether);

        IUniswapV2Router02(nexus.ROUTER()).swapTokensForExactTokens(
            repayUSDC,
            uint256(~0),
            pathTo[USDC],
            address(this),
            DEADLINE
        );
        printBalances("done", address(this));
    }

    function _buyRemainingOwing() private {
        uint256 interest = 36_000 * 1e6;
        // 0.09% flashloan fee
        IERC20(WETH).approve(nexus.ROUTER(), uint256(~0));
        IUniswapV2Router02(nexus.ROUTER()).swapTokensForExactTokens(
            interest,
            uint256(~0),
            pathTo[USDC],
            address(this),
            DEADLINE
        );
    }

    function _dumpAllUSDC() private {
        IUniswapV2Router02(nexus.ROUTER()).swapExactTokensForTokens(
            IERC20(USDC).balanceOf(address(this)),
            0,
            pathTo[WETH],
            address(this),
            DEADLINE
        );
        printBalances("after price rise", address(this));
    }
}
