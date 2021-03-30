// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./ISushiswapRouter.sol";
import "./LiquidityNexusBase.sol";

contract SushiSwapIntegration is LiquidityNexusBase {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public constant SLP = address(0x397FF1542f962076d0BFE58eA045FfA2d347ACa0); // Sushiswap USDC/ETH pair
    address public constant SROUTER = address(0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F); // Sushiswap Router2
    address[] public pathUsdToEth = new address[](2);
    address[] public pathEthToUsd = new address[](2);

    constructor() {
        pathEthToUsd[0] = WETH;
        pathEthToUsd[1] = USDC;
        pathUsdToEth[0] = USDC;
        pathUsdToEth[1] = WETH;
        IERC20(USDC).approve(SROUTER, uint256(-1));
        IERC20(SLP).approve(SROUTER, uint256(-1));
    }

    function ethToUsd(uint256 eth) public view returns (uint256 usd) {
        (uint112 rUsd, uint112 rEth, ) = IUniswapV2Pair(SLP).getReserves();
        usd = IUniswapV2Router02(SROUTER).quote(eth, rEth, rUsd);
    }

    /**
     * returns eth amount (in) needed when swapping for requested usd amount (out)
     */
    function ethAmountInForRequestedUsd(uint256 usd) public view returns (uint256 eth) {
        eth = IUniswapV2Router02(SROUTER).getAmountsIn(usd, pathEthToUsd)[0];
    }

    function swapUsdToEth(uint256 usd) internal returns (uint256 eth) {
        if (usd == 0) return 0;

        uint256[] memory amounts =
            IUniswapV2Router02(SROUTER).swapExactTokensForETH(usd, 0, pathUsdToEth, address(this), block.timestamp); // solhint-disable-line not-rely-on-time
        eth = amounts[1];
    }

    function swapEthToUsd(uint256 eth) internal returns (uint256 usd) {
        if (eth == 0) return 0;

        uint256[] memory amounts =
            IUniswapV2Router02(SROUTER).swapExactETHForTokens{value: eth}(
                0,
                pathEthToUsd,
                address(this),
                block.timestamp // solhint-disable-line not-rely-on-time
            );
        usd = amounts[1];
    }

    function _addLiquidity(uint256 amountETHMin, uint256 deadline)
        internal
        returns (
            uint256 amountToken,
            uint256 amountETH,
            uint256 liquidity
        )
    {
        uint256 usdcAmount = ethToUsd(msg.value);
        require(IERC20(USDC).balanceOf(address(this)) >= usdcAmount, "not enough free capital"); // TODO gracefully add or return

        (amountToken, amountETH, liquidity) = IUniswapV2Router02(SROUTER).addLiquidityETH{value: msg.value}(
            USDC,
            usdcAmount,
            0,
            amountETHMin,
            address(this),
            deadline
        );
    }

    function _removeLiquidity(
        uint liquidity,
        uint amountETHMin,
        uint deadline
    ) internal returns (uint256 amountToken, uint256 amountETH) {
        if (liquidity == 0) return (0, 0);

        (amountToken, amountETH) = IUniswapV2Router02(SROUTER).removeLiquidityETH(
            USDC,
            liquidity,
            0,
            amountETHMin,
            address(this),
            deadline
        );
    }

    function removeLiquiditySupportingFee(uint256 liquidity) internal {
        if (liquidity == 0) return;

        IUniswapV2Router02(SROUTER).removeLiquidityETHSupportingFeeOnTransferTokens( // in case of future fees
            USDC,
            liquidity,
            0,
            0,
            address(this),
            block.timestamp // solhint-disable-line not-rely-on-time
        );
    }
}
