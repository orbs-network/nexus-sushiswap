// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./ChainlinkOracle.sol";

contract PriceGuard is ChainlinkOracle {
    using SafeMath for uint256;

    uint256 public constant MAX_SPREAD_PCM = 10_000; //10%

    modifier priceGuard(uint256 priceETHUSD) {
        uint256 oraclePrice = chainlinkPriceETHUSD();
        uint256 min = Math.min(priceETHUSD, oraclePrice);
        uint256 max = Math.max(priceETHUSD, oraclePrice);
        uint256 upperLimit = min.mul(MAX_SPREAD_PCM.add(100_000)).div(100_000);
        require(max <= upperLimit, "PriceGuard ETHUSD");
        _;
    }
}
