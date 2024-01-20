type Either2dOr3d = [number, number, number?]

function setCoordinate(coord: Either2dOr3d) {
  //                                ^^^^^^
  //                     ^?
  //     ^^^
}
