import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address, Dictionary, storeStateInit } from '@ton/core';
import { jettonContentToCell, JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';
import { collectCellStats } from '../gasUtils';
import { Op, Errors } from '../wrappers/JettonConstants';

let blockchain: Blockchain;
let deployer: SandboxContract<TreasuryContract>;
let jettonMinter:SandboxContract<JettonMinter>;
let minter_code: Cell;
let wallet_code: Cell;
let jwallet_code_raw: Cell;
let jwallet_code: Cell;
let userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>;

describe('State init tests', () => {
    beforeAll(async () => {
        blockchain = await Blockchain.create();
        deployer   = await blockchain.treasury('deployer');
        jwallet_code_raw = await compile('JettonWallet');
        minter_code    = await compile('JettonMinter');

        //jwallet_code is library
        const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
        _libs.set(BigInt(`0x${jwallet_code_raw.hash().toString('hex')}`), jwallet_code_raw);
        const libs = beginCell().storeDictDirect(_libs).endCell();
        blockchain.libs = libs;

        const confDict = Dictionary.loadDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell(), blockchain.config);
        confDict.set(-1024, beginCell().storeBuffer(jwallet_code_raw.hash(), 32).endCell());
        blockchain.setConfig(beginCell().storeDictDirect(confDict).endCell());

        // let lib_prep = beginCell().storeUint(2,8).storeBuffer(jwallet_code_raw.hash()).endCell();

        /*
        * // Updatable and pausable wallet code
        *"Asm.fif" include
        *<{
        *  DUP ISZERO
        *  5 PUSHINT // if method_id is recv_internal, copy 5 stack elements
        *  1 PUSHINT // Else copy just method_id. Limited to get_methods with 0 arguments
        *  CONDSEL
        *  c4 PUSH
        *  c5 PUSH
        *  c7 PUSH
        *  // Fift stub
        *	<{
        *    2DROP // Clear catch args
        *    2 PUSHINT
        *    NEWC // constructor of library cell
        *    8 STU // store 02 as library identifier to library cell constructor
        *    -1024 PUSHINT CONFIGPARAM // X - is special index that is reserved for jetton code
        *    DROP // Drop the status
        *    CTOS // conver param to slice
        *    256 PUSHINT PLDUX SWAP // load 256 hash of the library
        *    256 STU // store hash to library cell constructor
        *    1 PUSHINT ENDXC // finalize library cell
        *    CTOS // open cell (it transparently replaced with actual code loaded via library mechanism)
        *    BLESS // convert slice to continuation (executable code)
        *    EXECUTE // start to execute
        *    // Return false, so THROWIF won't throw
        *    0 PUSHINT
        *	}>CONT
        *	
        *   c7 SETCONT
        *   c5 SETCONT
        *   c4 SETCONT
        *   SWAP
        *   -1 PUSHINT
        *   SETCONTVARARGS
        *<{ 40849517356361055192946520621652234430928522388750971481005990576651272944379 PUSHINT // PAUSE_HASH
        *      2 PUSHINT // store_uint lib prefix
        *      NEWC // Start building cell
        *      8 STU // lib prefix size
        *      256 STU // Storing the hash
        *      1 PUSHINT ENDXC // Close exotic
        *      CTOS // Open should throw 9 in tot present
        *      DROP // Drop slice
        *      1 PUSHINT // Return true
        *    }>CONT
        *    c1 PUSH
        *    COMPOSALT
        *    SWAP
        *    TRY
        *    1000 THROWIF // Will throw if catch is not called
        * }>c
        */


        jwallet_code = Cell.fromBase64("te6cckEBAQEAcQAA3iDAAHVx4wTtRO1F7UeOHFtyyMsHgfwA+DIw0IEBANcDAcv/cc8j0O0e2HDtZ+1l7WQBf+0Rji6C8FpQAepO6shFRNLzyB2LzFSc4tPO98yF4vToUK84f3r7csjLB8v/cc8j0DBx7UHt8QHy//LT6LCiPQ0=");

        //jwallet_code = new Cell({ exotic:true, bits: lib_prep.bits, refs:lib_prep.refs});

        console.log('jetton minter code hash = ', minter_code.hash().toString('hex'));
        console.log('jetton wallet code hash = ', jwallet_code.hash().toString('hex'));

        jettonMinter   = blockchain.openContract(
                   JettonMinter.createFromConfig(
                     {
                       admin: deployer.address,
                       wallet_code: jwallet_code,
                       jetton_content: jettonContentToCell({uri: "https://ton.org/"})
                     },
                     minter_code));

        userWallet = async (address:Address) => blockchain.openContract(
                          JettonWallet.createFromAddress(
                            await jettonMinter.getWalletAddress(address)
                          )
                     );

    });
    it('should deploy', async () => {

        //await blockchain.setVerbosityForAddress(jettonMinter.address, {blockchainLogs:true, vmLogs: 'vm_logs'});
        const deployResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('10'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
        });
        // Make sure it didn't bounce
        expect(deployResult.transactions).not.toHaveTransaction({
            on: deployer.address,
            from: jettonMinter.address,
            inMessageBounced: true
        });
    });
    it('should mint max jetton walue', async () => {
        const maxValue = (2n ** 120n) - 1n;
        const deployerWallet = await userWallet(deployer.address);
        const res = await jettonMinter.sendMint(deployer.getSender(),
                                                deployer.address,
                                                maxValue,
                                                null, null, null);
        expect(res.transactions).toHaveTransaction({
            on: deployerWallet.address,
            op: Op.internal_transfer,
            success: true,
        });

        const curBalance = await deployerWallet.getJettonBalance();
        expect(curBalance).toEqual(maxValue);
        const smc   = await blockchain.getContract(deployerWallet.address);
        if(smc.accountState === undefined)
            throw new Error("Can't access wallet account state");
        if(smc.accountState.type !== "active")
            throw new Error("Wallet account is not active");
        if(smc.account.account === undefined || smc.account.account === null)
            throw new Error("Can't access wallet account!");
        console.log("Jetton wallet max storage stats:", smc.account.account.storageStats.used);
        const state = smc.accountState.state;
        const stateCell = beginCell().store(storeStateInit(state)).endCell();
        console.log("State init stats:", collectCellStats(stateCell, []));
    });
});

