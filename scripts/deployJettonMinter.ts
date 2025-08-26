import {Cell, toNano} from '@ton/core';
import {JettonMinter} from '../wrappers/JettonMinter';
import {compile, NetworkProvider} from '@ton/blueprint';
import {promptUrl, promptUserFriendlyAddress} from "../wrappers/ui-utils";

export async function run(provider: NetworkProvider) {
    const isTestnet = provider.network() !== 'mainnet';

    const ui = provider.ui();

    const adminAddress = await promptUserFriendlyAddress("Enter the address of the jetton owner (admin):", ui, isTestnet);

    // e.g "https://bridge.ton.org/token/1/0x111111111117dC0aa78b770fA6A738034120C302.json"
    const jettonMetadataUri = await promptUrl("Enter jetton metadata uri (https://jettonowner.com/jetton.json)", ui)

    /*
    * // Updatable and pausable wallet code
    *"Asm.fif" include
    *<{
    *  DEPTH // Push number of elements on stack
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
    *   SWAP // Get stack depth to the top
    *   -1 PUSHINT
    *   SETCONTVARARGS // Copy arguments to continuation
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

    const jettonWalletCode = Cell.fromBase64("te6cckEBAQEAawAA0mjtRO1F7UeOHFtyyMsHgfwA+DIw0IEBANcDAcv/cc8j0O0e2HDtZ+1l7WQBf+0Rji6C8FpQAepO6shFRNLzyB2LzFSc4tPO98yF4vToUK84f3r7csjLB8v/cc8j0DBx7UHt8QHy//LT6EmPirY=");


    const minter = provider.open(JettonMinter.createFromConfig({
            admin: adminAddress.address,
            wallet_code: jettonWalletCode,
            jetton_content: {uri: jettonMetadataUri}
        },
        await compile('JettonMinter')));

    await minter.sendDeploy(provider.sender(), toNano("0.5"));
}
