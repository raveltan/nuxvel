export function genericErrorMessage(requestId: string | undefined) {
  return requestId === undefined ? "Something went wrong" : `Something went wrong (ref: ${requestId})`;
}
