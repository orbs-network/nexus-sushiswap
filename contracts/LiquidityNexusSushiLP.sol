// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./RebalancingStrategy1.sol";

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
        return _depositETH(amountETH, deadline);
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
        return _depositETH(amountETH, deadline);
    }

    function removeLiquidityETH(uint256 liquidity, uint256 deadline)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 exitETH)
    {
        exitETH = _withdrawETH(liquidity, deadline);
        IWETH(WETH).withdraw(exitETH);
        msg.sender.transfer(exitETH);
    }

    function removeLiquidity(uint256 liquidity, uint256 deadline)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 exitETH)
    {
        exitETH = _withdrawETH(liquidity, deadline);
        IERC20(WETH).safeTransfer(msg.sender, exitETH);
    }

    function removeAllLiquidity() external nonReentrant whenNotPaused returns (uint256 exitETH) {
        exitETH = _withdrawETH(balanceOf(msg.sender), block.timestamp); // solhint-disable-line not-rely-on-time
        IERC20(WETH).safeTransfer(msg.sender, exitETH);
    }

    function removeAllLiquidityETH() external nonReentrant whenNotPaused returns (uint256 exitETH) {
        exitETH = _withdrawETH(balanceOf(msg.sender), block.timestamp); // solhint-disable-line not-rely-on-time
        IWETH(WETH).withdraw(exitETH);
        msg.sender.transfer(exitETH);
    }

    function claimRewards() external nonReentrant whenNotPaused returns (uint256 rewards) {
        return _claimRewards();
    }

    function _depositETH(uint256 amountETH, uint256 deadline)
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
        totalLiquidity = totalLiquidity.add(liquidity);

        Minter storage minter = minters[msg.sender];
        minter.entryUSDC = minter.entryUSDC.add(addedUSDC);
        minter.entryETH = minter.entryETH.add(addedETH);
        minter.liquidity = minter.liquidity.add(liquidity);

        _mint(msg.sender, liquidity);

        _stake(liquidity);

        emit Mint(msg.sender, addedUSDC, addedETH);
    }

    function _withdrawETH(uint256 liquidity, uint256 deadline) internal returns (uint256 exitETH) {
        Minter storage minter = minters[msg.sender];
        liquidity = Math.min(liquidity, minter.liquidity);
        require(liquidity > 0, "sender not in minters");

        _burn(msg.sender, liquidity);
        _unstake(liquidity);

        (uint256 removedETH, uint256 removedUSDC) = _removeLiquidity(liquidity, deadline);

        uint256 entryUSDC = minter.entryUSDC.mul(liquidity).div(minter.liquidity);
        uint256 entryETH = minter.entryETH.mul(liquidity).div(minter.liquidity);
        uint256 exitUSDC;
        (exitUSDC, exitETH) = applyRebalance(removedUSDC, removedETH, entryUSDC, entryETH);

        minter.entryUSDC = minter.entryUSDC.sub(entryUSDC);
        minter.entryETH = minter.entryETH.sub(entryETH);
        minter.liquidity = minter.liquidity.sub(liquidity);

        totalInvestedUSDC = totalInvestedUSDC.sub(entryUSDC);
        totalInvestedETH = totalInvestedETH.sub(entryETH);
        totalLiquidity = totalLiquidity.sub(liquidity);

        emit Burn(msg.sender, exitUSDC, exitETH, msg.sender);
    }

    function emergencyExit() external onlyOwner {
        _removeLiquidity(totalLiquidity, block.timestamp); // solhint-disable-line not-rely-on-time
        withdrawFreeCapital();
        totalLiquidity = 0;
        totalInvestedUSDC = 0;
    }
}
