// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface IChainlinkOracle {
    function latestAnswer() external view returns (uint256);
}

contract ChainlinkOracle {
    address private constant CHAINLINK_ORACLE = address(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);

    /**
     * returns price of ETH in USD (6 decimals)
     */
    function chainlinkPriceETHUSD() public view returns (uint256) {
        return IChainlinkOracle(CHAINLINK_ORACLE).latestAnswer() / 100; // chainlink answer in 8 decimals
    }
}
