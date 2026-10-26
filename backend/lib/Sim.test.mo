import Sim "./Sim";

switch (Sim.run(0, 1, 1, 1, 12, "\02\04")) {
  case (#ok(result)) {
    assert result.energyLeft == 9;
    assert result.maxDepth == 0;
    assert result.score == 0;
  };
  case (#err(_)) assert false;
};

switch (Sim.run(0, 1, 1, 1, 12, "\02\02\04")) {
  case (#ok(result)) {
    assert result.energyLeft == 8;
    assert result.maxDepth == 1;
    assert result.score == 2;
  };
  case (#err(_)) assert false;
};

switch (Sim.run(0, 1, 1, 1, 12, "\02\02\00\02\04")) {
  case (#ok(result)) {
    assert result.energyLeft == 6;
    assert result.maxDepth == 1;
  };
  case (#err(_)) assert false;
};

switch (Sim.run(0, 1, 1, 1, 2, "\02")) {
  case (#ok(result)) {
    assert result.energyLeft == 0;
    assert result.maxDepth == 0;
  };
  case (#err(_)) assert false;
};

switch (Sim.run(0, 1, 1, 1, 1, "\02")) {
  case (#err(0)) {};
  case (_) assert false;
};
