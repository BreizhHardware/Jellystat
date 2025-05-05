import { useState, useEffect } from "react";
import axios from "../../../lib/axios_instance";
import Chart from "./chart";

import "../../css/stats.css";
import { Trans } from "react-i18next";

function DailyPlayStats(props) {

  const [stats, setStats] = useState();
  const [libraries, setLibraries] = useState();
  const [days, setDays] = useState(20);
  const [viewName, setViewName] = useState("viewCount");
  const token = localStorage.getItem("token");
  


  
  useEffect(() => {
    const fetchLibraries = () => {
      const url = `/stats/getViewsOverTime?days=${props.days}`;

      axios
        .get(
          url,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        )
        .then((data) => {
          setStats(data.data.stats);
          setLibraries(data.data.libraries);
        })
        .catch((error) => {
          console.log(error);
        });
    };

    if (!stats) {
      fetchLibraries();
    }
    if (days !== props.days) {
      setDays(props.days);
      fetchLibraries();
    }
    if (props.viewName !== viewName) {
      setViewName(props.viewName);
    }

    const intervalId = setInterval(fetchLibraries, 60000 * 5);
    return () => clearInterval(intervalId);
  }, [stats,libraries, days, props.days, token]);

  if (!stats) {
    return <></>;
  }

  const titleKey = viewName === "count" ? "STAT_PAGE.DAILY_PLAY_PER_LIBRARY" : "STAT_PAGE.DAILY_TIME_PER_LIBRARY";
  
  if (stats.length === 0) {
    return (
      <div className="main-widget">
        <h1><Trans i18nKey={titleKey}/> - {days} <Trans i18nKey={`UNITS.DAY${days>1 ? 'S':''}`}/></h1>

        <h5><Trans i18nKey={"ERROR_MESSAGES.NO_STATS"}/></h5>
      </div>
    );
  }
  return (
    <div className="main-widget">
      <h2 className="text-start my-2"><Trans i18nKey={titleKey}/> - <Trans i18nKey={"LAST"}/> {days} <Trans i18nKey={`UNITS.DAY${days>1 ? 'S':''}`}/></h2>

      <div className="graph">
         <Chart libraries={libraries} stats={stats} viewName={viewName}/>
      </div>
    </div>
  );
}

export default DailyPlayStats;
