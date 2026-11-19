import { type Address, isAddress, zeroAddress } from "viem";

/**
 * A funds destination must be a well-formed address other than the zero address. The zero address
 * passes the address format check, but nobody controls it, so a Send or a withdrawal to it would
 * burn the funds; it is refused in the form and again when the request is built.
 */
export function isFundsDestinationAddress(value: string): value is Address {
	return isAddress(value) && value.toLowerCase() !== zeroAddress;
}
