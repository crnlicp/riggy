import Types "types";
import Game "mixins/Game";

actor {
  let profiles : Types.Profiles;
  let shifts : Types.Shifts;
  let seeds : Types.Seeds;
  let boards : Types.DayBoards;
  let dayStats : Types.Stats;
  let names : Types.Names;
  let thresholds : Types.Thresholds;
  let market : Types.MarketState;

  include Game(profiles, shifts, seeds, boards, dayStats, names, thresholds, market);
};
