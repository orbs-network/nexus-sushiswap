// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./SushiSwapIntegration.sol";

contract RebalancingStrategy1 is SushiSwapIntegration {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /**
     * Rebalance usd and eth such that the eth provider takes all IL risk but receives all excess eth,
     * while usd provider's principal is protected
     */
    function applyRebalance(
        uint256 amountEth,
        uint256 amountUsd,
        uint256 ethEntry, // solhint-disable-line no-unused-vars
        uint256 usdEntry
    ) internal returns (uint256 ethExit, uint256 usdExit) {
        if (amountUsd > usdEntry) {
            uint256 usdDelta = amountUsd.sub(usdEntry);
            ethExit = amountEth.add(swapUsdToEth(usdDelta));
            usdExit = usdEntry;
        } else {
            uint256 usdDelta = usdEntry.sub(amountUsd);
            uint256 ethDelta = Math.min(amountEth, ethAmountInForRequestedUsd(usdDelta));
            usdExit = amountUsd.add(swapEthToUsd(ethDelta));
            ethExit = amountEth.sub(ethDelta);
        }
    }
}
