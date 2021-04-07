// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./RebalancingStrategy1.sol";

/**
 * The LiquidityNexus Auto Rebalancing Contract for USDC/ETH single sided liquidity provision on Sushiswap
 */
contract NexusLPSushi is ERC20("Nexus LP SushiSwap ETH/USDC", "NSLP"), RebalancingStrategy1 {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event Mint(address indexed sender, address indexed to, uint256 liquidity, uint256 shares);
    event Burn(
        address indexed sender,
        address indexed to,
        uint256 exitUSDC,
        uint256 exitETH,
        uint256 liquidity,
        uint256 shares
    );
    event ClaimedRewards(address indexed sender, uint256 amount);
    event CompoundedProfits(address indexed sender, uint256 liquidity);

    struct Minter {
        uint256 entryETH;
        uint256 entryUSDC;
        uint256 shares;
    }

    uint256 public totalLiquidity;
    uint256 public totalInvestedUSDC;
    uint256 public totalInvestedETH;
    mapping(address => Minter) public minters;

    function availableSpaceToDepositETH() external view returns (uint256 amountETH) {
        return quoteInverse(IERC20(USDC).balanceOf(address(this)));
    }

    function pricePerFullShare() external view returns (uint256) {
        if (totalSupply() == 0) return 0;
        return uint256(1e18).mul(totalLiquidity).div(totalSupply());
    }

    function addLiquidityETH(address to, uint256 deadline)
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
        return _depositETH(to, amountETH, deadline);
    }

    function addLiquidity(
        address to,
        uint256 amountETH,
        uint256 deadline
    )
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
        return _depositETH(to, amountETH, deadline);
    }

    function removeLiquidityETH(
        address payable to,
        uint256 shares,
        uint256 deadline
    ) external nonReentrant returns (uint256 exitETH) {
        exitETH = _withdrawETH(to, shares, deadline);
        IWETH(WETH).withdraw(exitETH);
        Address.sendValue(to, exitETH);
    }

    function removeLiquidity(
        address to,
        uint256 shares,
        uint256 deadline
    ) external nonReentrant returns (uint256 exitETH) {
        exitETH = _withdrawETH(to, shares, deadline);
        IERC20(WETH).safeTransfer(to, exitETH);
    }

    function removeAllLiquidityETH(address payable to) external nonReentrant returns (uint256 exitETH) {
        exitETH = _withdrawETH(to, balanceOf(msg.sender), block.timestamp); // solhint-disable-line not-rely-on-time
        IWETH(WETH).withdraw(exitETH);
        Address.sendValue(to, exitETH);
    }

    function removeAllLiquidity(address to) external nonReentrant returns (uint256 exitETH) {
        exitETH = _withdrawETH(to, balanceOf(msg.sender), block.timestamp); // solhint-disable-line not-rely-on-time
        IERC20(WETH).safeTransfer(to, exitETH);
    }

    function claimRewards() external nonReentrant onlyGovernance {
        _poolClaimRewards();
        uint256 amount = IERC20(REWARD).balanceOf(address(this));
        IERC20(REWARD).safeTransfer(msg.sender, amount);

        emit ClaimedRewards(msg.sender, amount);
    }

    function compoundProfits(uint256 amountETH)
        external
        nonReentrant
        onlyGovernance
        returns (
            uint256 addedUSDC,
            uint256 addedETH,
            uint256 liquidity
        )
    {
        IERC20(WETH).safeTransferFrom(msg.sender, address(this), amountETH);
        uint256 eth = IERC20(WETH).balanceOf(address(this));

        if (ownerRewardsPercentmil > 0) {
            uint256 ownerETH = eth.mul(ownerRewardsPercentmil).div(BASE_PERCENTMIL);
            _poolSwapExactETHForUSDC(ownerETH);
            eth = eth.sub(ownerETH);
        }

        _poolSwapExactETHForUSDC(eth.div(2));
        eth = IERC20(WETH).balanceOf(address(this));

        (addedUSDC, addedETH, liquidity) = _poolAddLiquidityAndStake(eth, block.timestamp); // solhint-disable-line not-rely-on-time
        totalInvestedUSDC = totalInvestedUSDC.add(addedUSDC);
        totalInvestedETH = totalInvestedETH.add(addedETH);
        totalLiquidity = totalLiquidity.add(liquidity);

        emit CompoundedProfits(msg.sender, liquidity);
    }

    function _depositETH(
        address to,
        uint256 amountETH,
        uint256 deadline
    )
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

        Minter storage minter = minters[to];
        minter.entryUSDC = minter.entryUSDC.add(addedUSDC);
        minter.entryETH = minter.entryETH.add(addedETH);
        minter.shares = minter.shares.add(shares);

        _mint(to, shares);

        emit Mint(msg.sender, to, liquidity, shares);
    }

    function _withdrawETH(
        address to,
        uint256 shares,
        uint256 deadline
    ) internal returns (uint256 exitETH) {
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

        emit Burn(msg.sender, to, exitUSDC, exitETH, liquidity, shares);
    }

    function emergencyExit() external onlyOwner {
        _poolUnstakeAndRemoveLiquidity(totalLiquidity, block.timestamp); // solhint-disable-line not-rely-on-time
        withdrawFreeCapital();
        totalLiquidity = 0;
        totalInvestedUSDC = 0;
    }
}
