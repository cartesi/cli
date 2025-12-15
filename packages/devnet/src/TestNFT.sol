// SPDX-License-Identifier: Apache-2.0
// Compatible with OpenZeppelin Contracts ^5.0
pragma solidity ^0.8;

import {ERC721} from "@openzeppelin-contracts-5.5.0/token/ERC721/ERC721.sol";
import {
    ERC721URIStorage
} from "@openzeppelin-contracts-5.5.0/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin-contracts-5.5.0/access/Ownable.sol";

contract TestNFT is ERC721, ERC721URIStorage, Ownable {
    constructor(
        address initialOwner
    ) ERC721("TestNFT", "SUNN") Ownable(initialOwner) {}

    function safeMint(
        address to,
        uint256 tokenId,
        string memory uri
    ) public onlyOwner {
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    // The following functions are overrides required by Solidity.

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
