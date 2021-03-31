// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./RebalancingStrategy1.sol";
import "./base/LiquidityNexusStaking.sol";

/**
 * The LiquidityNexus Auto Rebalancing Contract for USDC/ETH single sided liquidity
 */
contract LiquidityNexusSushiLP is ERC20("LiquidityNexusSushiLP", "LNSLP"), RebalancingStrategy1 {
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

    function addLiquidityETH(uint256 deadline)
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
        uint256 amountETH = msg.value;
        IWETH(WETH).deposit{value: amountETH}();
        return _addLiquidityInternal(amountETH, deadline);
    }

    function addLiquidity(uint256 amountETH, uint256 deadline)
        external
        nonReentrant
        whenNotPaused
        returns (
            uint256 addedUSDC,
            uint256 addedETH,
            uint256 liquidity
        )
    {
        IERC20(WETH).safeTransferFrom(msg.sender, address(this), amountETH);
        return _addLiquidityInternal(amountETH, deadline);
    }

    function removeLiquidityETH(uint256 liquidity, uint256 deadline)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 exitETH)
    {
        exitETH = _removeLiquidityInternal(liquidity, deadline);
        IWETH(WETH).withdraw(exitETH);
        msg.sender.transfer(exitETH);
    }

    function removeLiquidity(uint256 liquidity, uint256 deadline)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 exitETH)
    {
        exitETH = _removeLiquidityInternal(liquidity, deadline);
        IERC20(WETH).safeTransfer(msg.sender, exitETH);
    }

    function removeAllLiquidity() external nonReentrant whenNotPaused returns (uint256 exitETH) {
        exitETH = _removeLiquidityInternal(balanceOf(msg.sender), block.timestamp); // solhint-disable-line not-rely-on-time
        IERC20(WETH).safeTransfer(msg.sender, exitETH);
    }

    function removeAllLiquidityETH() external nonReentrant whenNotPaused returns (uint256 exitETH) {
        exitETH = _removeLiquidityInternal(balanceOf(msg.sender), block.timestamp); // solhint-disable-line not-rely-on-time
        IWETH(WETH).withdraw(exitETH);
        msg.sender.transfer(exitETH);
    }

    function _addLiquidityInternal(uint256 amountETH, uint256 deadline)
        internal
        returns (
            uint256 addedUSDC,
            uint256 addedETH,
            uint256 liquidity
        )
    {
        (addedUSDC, addedETH, liquidity) = _addLiquidity(amountETH, deadline);

        totalInvestedUSDC = totalInvestedUSDC.add(addedUSDC);
        totalInvestedETH = totalInvestedETH.add(addedETH);

        Minter storage acc = minters[msg.sender];
        acc.entryUSDC = acc.entryUSDC.add(addedUSDC);
        acc.entryETH = acc.entryETH.add(addedETH);
        acc.liquidity = acc.liquidity.add(liquidity);

        _mint(msg.sender, liquidity);
        emit Mint(msg.sender, addedUSDC, addedETH);
    }

    function _removeLiquidityInternal(uint256 liquidity, uint256 deadline) internal returns (uint256 exitETH) {
        Minter storage acc = minters[msg.sender];
        liquidity = Math.min(liquidity, acc.liquidity);
        require(liquidity > 0, "sender not in minters");

        _burn(msg.sender, liquidity);

        (uint256 removedUSDC, uint256 removedETH) = _removeLiquidity(liquidity, deadline);

        uint256 entryUSDC = acc.entryUSDC.mul(liquidity).div(acc.liquidity);
        uint256 entryETH = acc.entryETH.mul(liquidity).div(acc.liquidity);
        uint256 exitUSDC;
        (exitUSDC, exitETH) = applyRebalance(removedUSDC, removedETH, entryUSDC, entryETH);

        acc.entryUSDC = acc.entryUSDC.sub(entryUSDC);
        acc.entryETH = acc.entryETH.sub(entryETH);
        acc.liquidity = acc.liquidity.sub(liquidity);

        totalInvestedUSDC = totalInvestedUSDC.sub(entryUSDC);
        totalInvestedETH = totalInvestedETH.sub(entryETH);

        emit Burn(msg.sender, exitUSDC, exitETH, msg.sender);
    }

    function emergencyExit() external onlyOwner {
        _removeLiquidity(totalLiquidity, block.timestamp); // solhint-disable-line not-rely-on-time
        withdrawFreeCapital();
        totalLiquidity = 0;
        totalInvestedUSDC = 0;
    }
}
