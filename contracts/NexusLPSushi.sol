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

    event Mint(address indexed sender, address indexed beneficiary, uint256 liquidity, uint256 shares);
    event Burn(
        address indexed sender,
        address indexed beneficiary,
        uint256 exitUSDC,
        uint256 exitETH,
        uint256 liquidity,
        uint256 shares
    );
    event ClaimRewards(address indexed sender, uint256 amount);
    event CompoundProfits(address indexed sender, uint256 liquidity);

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

    function addLiquidityETH(address beneficiary, uint256 deadline)
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
        return _deposit(beneficiary, amountETH, deadline);
    }

    function addLiquidity(
        address beneficiary,
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
        return _deposit(beneficiary, amountETH, deadline);
    }

    function removeLiquidityETH(
        address payable beneficiary,
        uint256 shares,
        uint256 deadline
    ) external nonReentrant returns (uint256 exitETH) {
        exitETH = _withdraw(msg.sender, beneficiary, shares, deadline);
        IWETH(WETH).withdraw(exitETH);
        Address.sendValue(beneficiary, exitETH);
    }

    function removeLiquidity(
        address beneficiary,
        uint256 shares,
        uint256 deadline
    ) external nonReentrant returns (uint256 exitETH) {
        exitETH = _withdraw(msg.sender, beneficiary, shares, deadline);
        IERC20(WETH).safeTransfer(beneficiary, exitETH);
    }

    function removeAllLiquidityETH(address payable beneficiary, uint256 deadline)
        external
        nonReentrant
        returns (uint256 exitETH)
    {
        exitETH = _withdraw(msg.sender, beneficiary, balanceOf(msg.sender), deadline);
        IWETH(WETH).withdraw(exitETH);
        Address.sendValue(beneficiary, exitETH);
    }

    function removeAllLiquidity(address beneficiary, uint256 deadline) external nonReentrant returns (uint256 exitETH) {
        exitETH = _withdraw(msg.sender, beneficiary, balanceOf(msg.sender), deadline);
        IERC20(WETH).safeTransfer(beneficiary, exitETH);
    }

    function claimRewards() external nonReentrant onlyGovernance {
        _poolClaimRewards();
        uint256 amount = IERC20(REWARD).balanceOf(address(this));
        IERC20(REWARD).safeTransfer(msg.sender, amount);

        emit ClaimRewards(msg.sender, amount);
    }

    function compoundProfits(uint256 amountETH, uint256 capitalProviderRewardPercentmil)
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

        if (capitalProviderRewardPercentmil > 0) {
            uint256 ownerETH = eth.mul(capitalProviderRewardPercentmil).div(100_000);
            _poolSwapExactETHForUSDC(ownerETH);
            eth = IERC20(WETH).balanceOf(address(this));
        }

        _poolSwapExactETHForUSDC(eth.div(2));
        eth = IERC20(WETH).balanceOf(address(this));

        (addedUSDC, addedETH, liquidity) = _poolAddLiquidityAndStake(eth, block.timestamp); // solhint-disable-line not-rely-on-time
        totalInvestedUSDC = totalInvestedUSDC.add(addedUSDC);
        totalInvestedETH = totalInvestedETH.add(addedETH);
        totalLiquidity = totalLiquidity.add(liquidity);

        emit CompoundProfits(msg.sender, liquidity);
    }

    function _deposit(
        address beneficiary,
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

        Minter storage minter = minters[beneficiary];
        minter.entryUSDC = minter.entryUSDC.add(addedUSDC);
        minter.entryETH = minter.entryETH.add(addedETH);
        minter.shares = minter.shares.add(shares);

        _mint(beneficiary, shares);

        emit Mint(msg.sender, beneficiary, liquidity, shares);
    }

    function _withdraw(
        address sender,
        address beneficiary,
        uint256 shares,
        uint256 deadline
    ) internal returns (uint256 exitETH) {
        Minter storage minter = minters[sender];
        shares = Math.min(shares, minter.shares); // handles the case of transferred shares, only the original minter shares can be burned
        require(shares > 0, "sender not in minters");

        uint256 liquidity = shares.mul(totalLiquidity).div(totalSupply());

        _burn(sender, shares);

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

        emit Burn(sender, beneficiary, exitUSDC, exitETH, liquidity, shares);
    }

    function emergencyExit(address[] memory _minters) external onlyOwner {
        if (!paused()) _pause();

        for (uint256 i = 0; i < _minters.length; i++) {
            address minter = _minters[i];
            uint256 shares = balanceOf(minter);
            if (shares > 0) {
                _withdraw(minter, minter, shares, block.timestamp); // solhint-disable-line not-rely-on-time
            }
        }
        withdrawFreeCapital();
    }
}
