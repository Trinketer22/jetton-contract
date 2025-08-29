import { beginCell, Cell, Dictionary, DictionaryValue } from '@ton/core';

const CodeSegment : () => DictionaryValue<Cell> = () => {
    return  {
        parse: (src) => {
            return beginCell().storeSlice(src).endCell();
        },
        serialize: (src, builder) => {
            builder.storeSlice(src.asSlice())
        }
    }
};

export const LOADER_INDEX = 1337;
export const loadCodeFrom = (code: Cell, index: number = LOADER_INDEX): Cell => {
    const codeDict = Dictionary.loadDirect(Dictionary.Keys.Uint(19), CodeSegment(), code.refs[0]);
    const targetCode = codeDict.get(index);
    if(!targetCode) {
        throw new Error(`Method ${index} not found!`);
    }

    return targetCode;
}
