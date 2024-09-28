basin-coding will no longer be updated. Please see
[Basek](https://github.com/RexBerry/basek) instead.

# basin-coding

An implementation of base-N binary-to-text encoding.

-   Supports base-2 to base-256 binary-to-text encoding
-   Close to ideal output size
-   Not compatible with existing encodings (e.g., Base64, Base85)
-   Output doesn't compress well
-   Relatively slow

BasinCoding is an experimental binary-to-text encoder and decoder. It aims to produce a
smaller output than typical chunk-based binary-to-text encoders when given a random
sequence of bytes. This is achieved by using range coding with up to 40-bit precision.

BasinCoding does not attempt to compress the output in any way. If you need compression,
compress the binary data before encoding.

## Overhead

| Encoder         |    Overhead |
| --------------- | ----------: |
| ideal base-85   |  24.816852% |
| basin-coding 85 |  24.816855% |
| Base85          |  25.000000% |
| ideal base-10   | 140.823996% |
| basin-coding 10 | 140.823999% |
| chunked base-10 | 142.857143% |

The overhead numbers for basin-coding have been calculating using the encoded size of a
sequence of 50 million random bytes.

Base85 compresses groups of zero bytes, which BasinCoding doesn&rsquo;t do.

Chunked base-10 is a hypothetical encoder that encodes chunks of 7 bytes using 17
characters.

The advantage of basin-coding compared to other encoders is relatively small, so it may
not be worth using.
