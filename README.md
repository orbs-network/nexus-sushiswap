# LiquidityNexus Single Sided Liquidity Provision
> Auto Rebalancing, using Sushiswap ETH/USDC pair + Sushi Masterchef staking

### Background

* https://www.orbs.com/introducing-orbs-liquidity-nexus-liquidity-as-a-service/
* [Rebalancing Strategies](https://github.com/orbs-network/nexus-sushiswap/blob/main/SingleSidedILStrategies.pdf)

### tl;dr
* Accepts USDC from capital provider, holds capital until can be matched with ETH
    * The USDC provider is not able to withdraw other than emergency
* Accepts ETH (or WETH) from user
    * Joins both sides to provide liquidity on Sushiswap ETH/USDC pair
    * Auto stakes the resulting SLP into Sushi MasterChef
    * Mints shares (LNSLP) for user
    * User can withdraw at any time, no entry or exit fees
* Allows governance to claim rewards
    * Rewards will be auto liquidated by governance
    * Deposited back to LiquidityNexus to compoundProfits, adding liquidity and auto staking
    * Rewards are distributed per-share for all LiquidityNexus share holders
* Once user withdraws, auto-rebalances the resulting ETH/USDC pair according to the defined rebalancing strategy (see above)
    * The goal is to maximize resulting yield for ETH provider, while maintaining USDC provider's initial deposit
    * It is up to the governance to decide on the right distribution of rewards between USDC and ETH providers

### Running and testing locally

- `npm install`
- `npm run build`
- `npm run test`
