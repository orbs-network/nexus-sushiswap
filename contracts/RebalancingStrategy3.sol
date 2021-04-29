// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "./base/SushiswapIntegration.sol";

/**
 * THIS REBALANCING IS NOT FULLY TESTED, NOT PRODUCTION READY, CURRENTLY UNUSED
 */
contract RebalancingStrategy3 is SushiswapIntegration {
    /**
     * Rebalance usd and eth such that all IL is shared equally between eth and usd
     */
    function applyRebalance(
        uint256 removedUSDC,
        uint256 removedETH,
        uint256 entryUSDC,
        uint256 entryETH
    ) internal returns (uint256 exitUSDC, uint256 exitETH) {
        uint256 price = quote(1 ether); // this is weird
        uint256 removedETHPrice = removedETH * price;
        uint256 entryETHPrice = entryETH * price;
        uint256 num = entryETH * (removedUSDC + removedETHPrice);
        uint256 denom = entryUSDC + entryETHPrice;
        exitETH = num / denom;
        exitUSDC = (removedUSDC + removedETHPrice) - (exitETH * price);
    }
}
