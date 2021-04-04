// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./LiquidityNexusBase.sol";
import "../interface/ISushiswapRouter.sol";
import "../interface/ISushiMasterChef.sol";

contract SushiswapIntegration is LiquidityNexusBase {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public constant SLP = address(0x397FF1542f962076d0BFE58eA045FfA2d347ACa0); // Sushiswap USDC/ETH pair
    address public constant SROUTER = address(0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F); // Sushiswap Router2
    address public constant MASTERCHEF = address(0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd);
    address public constant SUSHI = address(0x6B3595068778DD592e39A122f4f5a5cF09C90fE2);
    uint256 public constant POOL_ID = 1;
    address[] public pathToETH = new address[](2);
    address[] public pathToUSDC = new address[](2);

    constructor() {
        pathToUSDC[0] = WETH;
        pathToUSDC[1] = USDC;
        pathToETH[0] = USDC;
        pathToETH[1] = WETH;

        IERC20(USDC).approve(SROUTER, uint256(~0));
        IERC20(WETH).approve(SROUTER, uint256(~0));
        IERC20(SLP).approve(SROUTER, uint256(~0));

        IERC20(SLP).approve(MASTERCHEF, uint256(~0));
    }

    function quote(uint256 inETH) public view returns (uint256 outUSDC) {
        (uint112 rUSDC, uint112 rETH, ) = IUniswapV2Pair(SLP).getReserves();
        outUSDC = IUniswapV2Router02(SROUTER).quote(inETH, rETH, rUSDC);
    }

    /**
     * returns eth amount (in) needed when swapping for requested usd amount (out)
     */
    function amountInETHForRequestedOutUSDC(uint256 outUSDC) public view returns (uint256 inETH) {
        inETH = IUniswapV2Router02(SROUTER).getAmountsIn(outUSDC, pathToUSDC)[0];
    }

    function _swapExactUSDCForETH(uint256 inUSDC) internal returns (uint256 outETH) {
        if (inUSDC == 0) return 0;

        uint256[] memory amounts =
            IUniswapV2Router02(SROUTER).swapExactTokensForTokens(inUSDC, 0, pathToETH, address(this), block.timestamp); // solhint-disable-line not-rely-on-time
        outETH = amounts[1];
    }

    function _swapExactETHForUSDC(uint256 inETH) internal returns (uint256 outUSDC) {
        if (inETH == 0) return 0;

        uint256[] memory amounts =
            IUniswapV2Router02(SROUTER).swapExactTokensForTokens(
                inETH,
                0,
                pathToUSDC,
                address(this),
                block.timestamp // solhint-disable-line not-rely-on-time
            );
        outUSDC = amounts[1];
    }

    function _addLiquidity(uint256 amountETH, uint256 deadline)
        internal
        returns (
            uint256 addedUSDC,
            uint256 addedETH,
            uint256 liquidity
        )
    {
        require(IERC20(WETH).balanceOf(address(this)) >= amountETH, "not enough WETH");
        uint256 quotedUSDC = quote(amountETH);
        require(IERC20(USDC).balanceOf(address(this)) >= quotedUSDC, "not enough free capital");

        (addedETH, addedUSDC, liquidity) = IUniswapV2Router02(SROUTER).addLiquidity(
            WETH,
            USDC,
            amountETH,
            quotedUSDC,
            amountETH,
            0,
            address(this),
            deadline
        );
    }

    function _removeLiquidity(uint256 liquidity, uint256 deadline)
        internal
        returns (uint256 removedETH, uint256 removedUSDC)
    {
        if (liquidity == 0) return (0, 0);

        (removedETH, removedUSDC) = IUniswapV2Router02(SROUTER).removeLiquidity(
            WETH,
            USDC,
            liquidity,
            0,
            0,
            address(this),
            deadline
        );
    }

    function _stake(uint256 amount) internal {
        IMasterChef(MASTERCHEF).deposit(POOL_ID, amount);
    }

    function _unstake(uint256 amount) internal {
        IMasterChef(MASTERCHEF).withdraw(POOL_ID, amount);
    }

    function _claimRewards() internal returns (uint256 rewards) {
        uint256 s1 = IERC20(SUSHI).balanceOf(address(this));
        IMasterChef(MASTERCHEF).deposit(POOL_ID, 0);
        uint256 s2 = IERC20(SUSHI).balanceOf(address(this));
        return s2.sub(s1);
    }
}
