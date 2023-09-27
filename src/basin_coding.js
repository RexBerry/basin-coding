const [DEFAULT_ALPHABET, Encoder, Decoder] = (() => {
    "use strict"

    const DEFAULT_ALPHABET
        = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
        + "!@#$%^*()-=;,./_+{}|:?~"
    const MIN_ALPHABET_SIZE = 2
    const MAX_ALPHABET_SIZE = 256
    // The size of the alphabet must not be greater than the number of possible
    // values of a byte
    // Otherwise things might break

    /**
     * Encodes binary or string data to a base-n text representation
     */
    class Encoder {
        /**
         * Create an Encoder object with the provided or default alphabet
         * @param {string} alphabet The alphabet to use. Uses a base-85
         *  alphabet by default. All characters should be unique.
         */
        constructor(alphabet = DEFAULT_ALPHABET) {
            if (alphabet.length < MIN_ALPHABET_SIZE) {
                throw new Error(
                    `alphabet must have at least ${MIN_ALPHABET_SIZE}`
                    + ` characters`
                )
            }
            if (alphabet.length > MAX_ALPHABET_SIZE) {
                throw new Error(
                    `alphabet must not contain more than`
                    + ` ${MAX_ALPHABET_SIZE} characters`
                )
            }

            this.encodingTable = alphabet
        }

        /**
         * Encode a sequence of bytes to text
         * @param {Iterable<Number>} bytes The sequence of bytes to encode
         * @returns {string} The encoded text
         */
        encode(bytes) {
            // Uses range coding to do a pseudo-base conversion
            const base = this.encodingTable.length
            const [msdDivisor, secondMsdDivisor, maxDigitsToEmit, _]
                = calculateParams(base)

            const result = new StringBuilder()

            let bytesEncoded = 0
            let lo = 0
            let hi = msdDivisor * base - 1
            let digitsToAdd = 0
            let digitsToAddHiMsd = 0
            for (const byte of bytes) {
                const nextLo
                    = lo + Math.ceil((hi - lo + 1) * byte * (1 / 256))
                const nextHi = lo + (
                    Math.ceil((hi - lo + 1) * (byte + 1) * (1 / 256)) - 1
                )
                lo = nextLo
                hi = nextHi

                for (let _ = maxDigitsToEmit; _--;) {
                    let loMsd = Math.floor(lo / msdDivisor)
                    let hiMsd = Math.floor(hi / msdDivisor)

                    if (hiMsd - loMsd === 1) {
                        if (
                            Math.floor(lo / secondMsdDivisor) % base
                                === base - 1
                            && Math.floor(hi / secondMsdDivisor) % base === 0
                        ) {
                            lo = loMsd * msdDivisor
                                + lo % secondMsdDivisor * base
                            hi = hiMsd * msdDivisor
                                + hi % secondMsdDivisor * base
                            ++digitsToAdd
                            digitsToAddHiMsd = hiMsd
                        } else {
                            break
                        }
                    } else if (loMsd === hiMsd) {
                        result.add(this.encodingTable[hiMsd])
                        if (digitsToAdd > 0) {
                            const charToAdd = this.encodingTable[
                                hiMsd === digitsToAddHiMsd ? 0 : base - 1
                            ]
                            for (; digitsToAdd > 0; --digitsToAdd) {
                                result.add(charToAdd)
                            }
                        }
                        lo = lo % msdDivisor * base
                        hi = hi % msdDivisor * base
                    } else {
                        break
                    }
                }

                ++bytesEncoded
            }

            result.add(this.encodingTable[Math.floor(hi / msdDivisor)])
            if (digitsToAdd > 0) {
                const charToAdd = this.encodingTable[0]
                for (; digitsToAdd > 0; --digitsToAdd) {
                    result.add(charToAdd)
                }
            }
            result.add(this.encodingTable[bytesEncoded % 2])

            return result.toString()
        }

        /**
         * Encode a string to text
         * @param {string} string The string to encode
         * @returns {string} The encoded text
         */
        encodeFromString(string) {
            return this.encode(new TextEncoder().encode(string))
        }
    }

    /**
     * Decodes base-n text to binary or string data
     */
    class Decoder {
        /**
         * Create a Decoder object with the provided or default alphabet
         * @param {string} alphabet The alphabet to use. Uses a base-85
         *  alphabet by default. All characters should be unique.
         */
        constructor(alphabet = DEFAULT_ALPHABET) {
            if (alphabet.length < MIN_ALPHABET_SIZE) {
                throw new Error(
                    `alphabet must have at least ${MIN_ALPHABET_SIZE}`
                    + ` characters`
                )
            }
            if (alphabet.length > MAX_ALPHABET_SIZE) {
                throw new Error(
                    `alphabet must not contain more than`
                    + ` ${MAX_ALPHABET_SIZE} characters`
                )
            }

            this.decodingTable = new Map()
            for (let i = alphabet.length; i--;) {
                this.decodingTable.set(alphabet.charCodeAt(i), i)
            }
        }

        /**
         * Decode text to a sequence of bytes
         * @param {string} encodedText The text to decode
         * @returns {Iterable<Number>} The decoded bytes
         */
        decode(encodedText) {
            return decode(encodedText, this.decodingTable)
        }

        /**
         * Decode text to a string
         * @param {string} encodedText The text to decode
         * @returns {string} The decoded string
         */
        decodeToString(encodedText) {
            return new TextDecoder().decode(
                new Uint8Array([...this.decode(encodedText)])
            )
        }
    }

    function* decode(encodedText, decodingTable) {
        const endIndex = encodedText.length - 1
        if (
            endIndex < 0
            || !decodingTable.has(encodedText.charCodeAt(endIndex))
        ) {
            throw new Error("invalid input string")
        }
        const lengthParity
            = decodingTable.get(encodedText.charCodeAt(endIndex))
        if (lengthParity > 1) {
            throw new Error("invalid input string")
        }

        const base = decodingTable.size
        const [
            msdDivisor, secondMsdDivisor, maxDigitsToEmit, maxDigitsToDecode
        ] = calculateParams(base)

        let bytesDecoded = 0
        let lo = 0
        let hi = msdDivisor * base - 1
        let i = 0
        let digitsToDecode = 0
        let requestedDigits = maxDigitsToDecode
        let requestedDigitsKeepMsd = 0
        let isLastDigit = false
        while (true) {
            while (requestedDigits > 0) {
                let digit
                if (i < endIndex) {
                    const charCode = encodedText.charCodeAt(i)
                    if (!decodingTable.has(charCode)) {
                        if (isWhitespace(encodedText[i])) {
                            continue
                        }
                        throw new Error("invalid input string")
                    }
                    digit = decodingTable.get(charCode)
                } else {
                    digit = 0
                    if (i - endIndex === maxDigitsToDecode - 2) {
                        isLastDigit = true
                    }
                }

                ++i
                if (requestedDigits === requestedDigitsKeepMsd) {
                    const digitsToDecodeMsd
                        = Math.floor(digitsToDecode / msdDivisor)
                    digitsToDecode
                        = digitsToDecodeMsd * msdDivisor
                        + digitsToDecode % secondMsdDivisor * base
                        + digit
                    --requestedDigitsKeepMsd
                } else {
                    digitsToDecode = digitsToDecode % msdDivisor * base + digit
                }
                --requestedDigits
            }

            const byte = Math.floor(
                256 * (digitsToDecode - lo) / (hi - lo + 1)
            )

            if (isLastDigit) {
                if (bytesDecoded % 2 !== lengthParity) {
                    yield byte
                }
                return
            }

            yield byte

            const nextLo
                = lo + Math.ceil((hi - lo + 1) * byte * (1 / 256))
            const nextHi = lo + (
                Math.ceil((hi - lo + 1) * (byte + 1) * (1 / 256)) - 1
            )
            lo = nextLo
            hi = nextHi

            for (let _ = maxDigitsToEmit; _--;) {
                let loMsd = Math.floor(lo / msdDivisor)
                let hiMsd = Math.floor(hi / msdDivisor)

                if (hiMsd - loMsd === 1) {
                    if (
                        Math.floor(lo / secondMsdDivisor) % base === base - 1
                        && Math.floor(hi / secondMsdDivisor) % base === 0
                    ) {
                        lo = loMsd * msdDivisor
                            + lo % secondMsdDivisor * base
                        hi = hiMsd * msdDivisor
                            + hi % secondMsdDivisor * base
                        ++requestedDigits
                        ++requestedDigitsKeepMsd
                    } else {
                        break
                    }
                } else if (loMsd === hiMsd) {
                    lo = lo % msdDivisor * base
                    hi = hi % msdDivisor * base
                    ++requestedDigits
                } else {
                    break
                }
            }

            ++bytesDecoded
        }
    }

    function calculateParams(base) {
        let msdDivisor = 1
        let maxDigitsToDecode = 0
        while (msdDivisor <= 0x100_0000_0000) {
            msdDivisor *= base
            ++maxDigitsToDecode
        }
        msdDivisor = Math.floor(msdDivisor / (base * base))
        const secondMsdDivisor = Math.floor(msdDivisor / base)
        --maxDigitsToDecode

        let maxDigitsToEmit = 1
        let tmp = 1
        while (tmp < 0x100) {
            tmp *= base
            ++maxDigitsToEmit
        }

        return [
            msdDivisor, secondMsdDivisor, maxDigitsToEmit, maxDigitsToDecode
        ]
    }

    class StringBuilder {
        constructor() {
            this.chunks = []
            this.currChunk = []
            this.currChunkLength = 0
        }

        add(string) {
            if (this.currChunkLength >= 1024) {
                this.chunks.push(this.currChunk.join(""))
                this.currChunk.length = 0
                this.currChunkLength = 0
            }

            this.currChunk.push(string)
            this.currChunkLength += string.length
        }

        toString() {
            return this.chunks.concat(this.currChunk).join("")
        }
    }

    function isWhitespace(ch) {
        return " \n\r\t\v\f\u00A0\u2028\u2029".includes(ch)
    }

    return [DEFAULT_ALPHABET, Encoder, Decoder]
})()

export { DEFAULT_ALPHABET, Encoder, Decoder }
