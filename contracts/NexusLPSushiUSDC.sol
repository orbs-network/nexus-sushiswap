// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./RebalancingStrategy1.sol";

/**
 * The LiquidityNexus Auto Rebalancing Contract for USDC/ETH single sided liquidity provision on Sushiswap
 */
contract NexusLPSushiUSDC is ERC20("NexusLPSushiUSDC", "NSLP"), RebalancingStrategy1 {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event Mint(address indexed sender, uint256 amountUSDC, uint256 amountETH, uint256 liquidity, uint256 shares);
    event Burn(
        address indexed sender,
        uint256 amountUSDC,
        uint256 amountETH,
        uint256 liquidity,
        uint256 shares,
        address indexed to
    );

    struct Minter {
        uint256 entryETH;
        uint256 entryUSDC;
        uint256 shares;
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
            uint256 shares
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
            uint256 shares
        )
    {
        IERC20(WETH).safeTransferFrom(msg.sender, address(this), amountETH);
        return _depositETH(amountETH, deadline);
    }

    function removeLiquidityETH(uint256 shares, uint256 deadline)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 exitETH)
    {
        exitETH = _withdrawETH(shares, deadline);
        IWETH(WETH).withdraw(exitETH);
        Address.sendValue(msg.sender, exitETH);
    }

    function removeLiquidity(uint256 shares, uint256 deadline)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 exitETH)
    {
        exitETH = _withdrawETH(shares, deadline);
        IERC20(WETH).safeTransfer(msg.sender, exitETH);
    }

    function removeAllLiquidity() external nonReentrant whenNotPaused returns (uint256 exitETH) {
        exitETH = _withdrawETH(balanceOf(msg.sender), block.timestamp); // solhint-disable-line not-rely-on-time
        IERC20(WETH).safeTransfer(msg.sender, exitETH);
    }

    function removeAllLiquidityETH() external nonReentrant whenNotPaused returns (uint256 exitETH) {
        exitETH = _withdrawETH(balanceOf(msg.sender), block.timestamp); // solhint-disable-line not-rely-on-time
        IWETH(WETH).withdraw(exitETH);
        Address.sendValue(msg.sender, exitETH);
    }

    function claimRewards() external nonReentrant whenNotPaused onlyGovernance {
        _poolClaimRewards();
        IERC20(REWARD).safeTransfer(msg.sender, IERC20(REWARD).balanceOf(address(this)));
    }

    function compoundProfits(uint256 amountETH)
        external
        nonReentrant
        whenNotPaused
        onlyGovernance
        returns (
            uint256 addedUSDC,
            uint256 addedETH,
            uint256 liquidity
        )
    {
        IERC20(WETH).safeTransferFrom(msg.sender, address(this), amountETH);

        uint256 eth = IERC20(WETH).balanceOf(address(this));
        _poolSwapExactETHForUSDC(eth.div(2));
        eth = IERC20(WETH).balanceOf(address(this));

        (addedUSDC, addedETH, liquidity) = _poolAddLiquidityAndStake(eth, block.timestamp); // solhint-disable-line not-rely-on-time
        totalInvestedUSDC = totalInvestedUSDC.add(addedUSDC);
        totalInvestedETH = totalInvestedETH.add(addedETH);
        totalLiquidity = totalLiquidity.add(liquidity);
    }

    function _depositETH(uint256 amountETH, uint256 deadline)
        internal
        returns (
            uint256 addedUSDC,
            uint256 addedETH,
            uint256 shares
        )
    {
        uint256 liquidity;
        (addedUSDC, addedETH, liquidity) = _poolAddLiquidityAndStake(amountETH, deadline);

        if (totalSupply() == 0) {
            shares = liquidity;
        } else {
            shares = liquidity.mul(totalSupply()).div(totalLiquidity);
        }

        totalInvestedUSDC = totalInvestedUSDC.add(addedUSDC);
        totalInvestedETH = totalInvestedETH.add(addedETH);
        totalLiquidity = totalLiquidity.add(liquidity);

        Minter storage minter = minters[msg.sender];
        minter.entryUSDC = minter.entryUSDC.add(addedUSDC);
        minter.entryETH = minter.entryETH.add(addedETH);
        minter.shares = minter.shares.add(shares);

        _mint(msg.sender, shares);

        emit Mint(msg.sender, addedUSDC, addedETH, liquidity, shares);
    }

    function _withdrawETH(uint256 shares, uint256 deadline) internal returns (uint256 exitETH) {
        Minter storage minter = minters[msg.sender];
        shares = Math.min(shares, minter.shares); // handles the case of transferred shares, only the original minter shares count
        require(shares > 0, "sender not in minters");

        uint256 liquidity = shares.mul(totalLiquidity).div(totalSupply());

        _burn(msg.sender, shares);

        (uint256 removedETH, uint256 removedUSDC) = _poolUnstakeAndRemoveLiquidity(liquidity, deadline);

        uint256 entryUSDC = minter.entryUSDC.mul(shares).div(minter.shares);
        uint256 entryETH = minter.entryETH.mul(shares).div(minter.shares);
        uint256 exitUSDC;
        (exitUSDC, exitETH) = applyRebalance(removedUSDC, removedETH, entryUSDC, entryETH);

        minter.entryUSDC = minter.entryUSDC.sub(entryUSDC);
        minter.entryETH = minter.entryETH.sub(entryETH);
        minter.shares = minter.shares.sub(shares);

        totalInvestedUSDC = totalInvestedUSDC.sub(entryUSDC);
        totalInvestedETH = totalInvestedETH.sub(entryETH);
        totalLiquidity = totalLiquidity.sub(liquidity);

        emit Burn(msg.sender, exitUSDC, exitETH, liquidity, shares, msg.sender);
    }

    function emergencyExit() external onlyOwner {
        _poolUnstakeAndRemoveLiquidity(totalLiquidity, block.timestamp); // solhint-disable-line not-rely-on-time
        withdrawFreeCapital();
        totalLiquidity = 0;
        totalInvestedUSDC = 0;
    }
}
