// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./RebalancingStrategy1.sol";
import "./SushiSwapIntegration.sol";
import "./LiquidityNexusBase.sol";

/**
 * The LiquidityNexus Auto Rebalancing Contract
 */
contract NexusSushiSingleEthUSDC is ERC20("NexusSushiSingleLP", "NSSLP"), RebalancingStrategy1 {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event Mint(address indexed sender, uint256 amountUSDC, uint256 amountETH);
    event Burn(address indexed sender, uint256 amountUSDC, uint256 amountETH, address indexed to);

    struct Minter {
        uint256 entryETH;
        uint256 entryUSDC;
        uint256 liquidity;
    }

    uint256 public totalLiquidity;
    uint256 public totalInvestedUSDC;
    uint256 public totalInvestedETH;
    mapping(address => Minter) public minters;

    function addLiquidityETH(
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        external
        payable
        nonReentrant
        whenNotPaused
        returns (
            uint256 addedUSDC,
            uint256 addedETH,
            uint256 liquidity
        )
    {
        uint256 amountETH = msg.value; // TODO this is implicit, better to just pass the amount as parameter and approve WETH?
        IWETH(WETH).deposit{value: amountETH}();

        // TODO always supply more USDC than ETH when adding liquidity, revert in case leftover ETH (which means not enough USDC)
        // TODO which means amountETHMin is not needed, always 100% of deposited ETH
        (addedUSDC, addedETH, liquidity) = _addLiquidity(amountETH, amountETHMin, deadline);

        totalInvestedUSDC = totalInvestedUSDC.add(addedUSDC);
        totalInvestedETH = totalInvestedETH.add(addedETH);

        Minter storage acc = minters[to];
        acc.entryUSDC = acc.entryUSDC.add(addedUSDC);
        acc.entryETH = acc.entryETH.add(addedETH);
        acc.liquidity = acc.liquidity.add(liquidity);

        _mint(to, liquidity);
    }

    function removeLiquidityETH(
        uint256 liquidity,
        uint256 amountETHMin,
        address payable to,
        uint256 deadline
    ) public nonReentrant whenNotPaused returns (uint256 exitETH) {
        Minter storage acc = minters[msg.sender];
        liquidity = Math.min(liquidity, acc.liquidity);
        require(liquidity > 0, "sender not in minters");

        _burn(msg.sender, liquidity);

        (uint256 removedUSDC, uint256 removedETH) = _removeLiquidity(liquidity, amountETHMin, deadline);

        uint256 entryUSDC = acc.entryUSDC.mul(liquidity).div(acc.liquidity);
        uint256 entryETH = acc.entryETH.mul(liquidity).div(acc.liquidity);
        uint256 exitUSDC;
        (exitUSDC, exitETH) = applyRebalance(removedUSDC, removedETH, entryUSDC, entryETH);

        acc.entryUSDC = acc.entryUSDC.sub(entryUSDC);
        acc.entryETH = acc.entryETH.sub(entryETH);
        acc.liquidity = acc.liquidity.sub(liquidity);

        totalInvestedUSDC = totalInvestedUSDC.sub(entryUSDC);
        totalInvestedETH = totalInvestedETH.sub(entryETH);

        IWETH(WETH).withdraw(exitETH);
        to.transfer(exitETH);
    }

    function removeAllLiquidityETH(
        uint256 amountETHMin,
        address payable to,
        uint256 deadline
    ) external returns (uint256 exitETH) {
        exitETH = removeLiquidityETH(balanceOf(msg.sender), amountETHMin, to, deadline);
    }

    function emergencyExit() external onlyOwner {
        _removeLiquidity(totalLiquidity, 0, block.timestamp); // solhint-disable-line not-rely-on-time
        withdrawFreeCapital();
        totalLiquidity = 0;
        totalInvestedUSDC = 0;
    }
}
