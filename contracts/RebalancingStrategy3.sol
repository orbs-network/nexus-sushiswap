// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "./base/SushiswapIntegration.sol";

/**
 * THIS REBALANCING IS NOT FULLY TESTED, NOT PRODUCTION READY, CURRENTLY UNUSED
 */
contract RebalancingStrategy3 is SushiswapIntegration {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /**
     * Rebalance usd and eth such that all IL is shared equally between eth and usd
     */
    function applyRebalance(
        uint256 removedUSDC,
        uint256 removedETH,
        uint256 entryUSDC,
        uint256 entryETH
    ) internal returns (uint256 exitUSDC, uint256 exitETH) {
        uint256 price = quote(1e18); // this is weird
        uint256 removedETHPrice = removedETH.mul(price);
        uint256 entryETHPrice = entryETH.mul(price);
        uint256 num = entryETH.mul(removedUSDC.add(removedETHPrice));
        uint256 denom = entryUSDC.add(entryETHPrice);
        exitETH = num.div(denom);
        exitUSDC = removedUSDC.add(removedETHPrice).sub(exitETH.mul(price));
    }
}
