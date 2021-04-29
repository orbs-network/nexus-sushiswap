// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "./base/SushiswapIntegration.sol";

/**
 * THIS REBALANCING IS NOT FULLY TESTED, NOT PRODUCTION READY, CURRENTLY UNUSED
 */
contract RebalancingStrategy2 is SushiswapIntegration {
    /**
     * Rebalance usd and eth such that any excess eth is swapped to usd and any excess usd is swapped to eth,
     * preferring first to compensate eth provider while maintaining usd provider initial principal
     */
    function applyRebalance(
        uint256 removedUSDC,
        uint256 removedETH,
        uint256 entryUSDC,
        uint256 entryETH
    ) internal returns (uint256 exitUSDC, uint256 exitETH) {
        if (removedUSDC > entryUSDC) {
            uint256 deltaUSDC = removedUSDC - entryUSDC;
            exitETH = removedETH + _swapExactUSDCForETH(deltaUSDC);
            exitUSDC = entryUSDC;
        } else {
            uint256 deltaETH = removedETH - entryETH; // underflow?
            exitUSDC = removedUSDC + _swapExactETHForUSDC(deltaETH);
            exitETH = entryETH;
        }
    }
}
