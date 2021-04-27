import { balanceUSDC, deployer, nexus, usdcWhale } from "./test-base";
import { deployContract } from "../src/extensions";
import _ from "lodash";
import { TestBase } from "../typechain-hardhat/TestBase";
import BN from "bn.js";
import { bn18, bn6 } from "../src/utils";
import { Tokens } from "../src/token";

interface SolidityTestParams {
  contractName: string;
  deployer: string;
  constructorArgs: () => string[];
  initialBalance: BN;
  beforeEachFn: (testContract: string) => Promise<void>;
}

function solidityTestSuite<ContractType extends TestBase>({
  contractName,
  deployer,
  constructorArgs,
  initialBalance,
  beforeEachFn,
}: SolidityTestParams) {
  describe.only(`Solidity based tests for ${contractName}`, () => {
    let test: ContractType;

    beforeEach(async () => {
      test = await deployContract<ContractType>(contractName, deployer, constructorArgs(), initialBalance);
      await beforeEachFn(test.options.address);
      await test.methods.beforeEach().send({ from: deployer });
    });

    afterEach(async () => {
      await test.methods.afterEach().send({ from: deployer });
    });

    _.map(require(`../artifacts/contracts/test/${contractName}.sol/${contractName}.json`).abi, (item) => {
      const type = _.get(item, "type");
      const name = _.get(item, "name");
      if (type == "function" && _.startsWith(name, "test")) {
        it(`contract ${name}`, async () => {
          await _.invoke(_.invoke(test.methods, name), "send", { from: deployer });
        });
      }
    });
  });
}

solidityTestSuite({
  contractName: "TestSanity",
  deployer: deployer,
  constructorArgs: () => [nexus.options.address],
  initialBalance: bn18("10,000,000"),
  beforeEachFn: async (testContract: string) => {
    await nexus.methods.setGovernance(testContract).send({ from: deployer });
  },
});

solidityTestSuite({
  contractName: "TestSecurity",
  deployer: deployer,
  constructorArgs: () => [nexus.options.address],
  initialBalance: bn18("10,000,000"),
  beforeEachFn: async (testContract: string) => {
    await nexus.methods.setGovernance(testContract).send({ from: deployer });
    await Tokens.USDC().methods.transfer(testContract, bn6("300,000,000")).send({ from: usdcWhale });
  },
});
