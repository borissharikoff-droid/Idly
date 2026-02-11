export declare const IPC_CHANNELS: {
    readonly tracker: {
        readonly start: "tracker:start";
        readonly stop: "tracker:stop";
        readonly pause: "tracker:pause";
        readonly resume: "tracker:resume";
        readonly getCurrentActivity: "tracker:getCurrentActivity";
        readonly setAfkThreshold: "tracker:setAfkThreshold";
        readonly activityUpdate: "tracker:activityUpdate";
        readonly idleChange: "tracker:idleChange";
    };
    readonly db: {
        readonly getSessions: "db:getSessions";
        readonly getSessionById: "db:getSessionById";
        readonly getActivitiesBySessionId: "db:getActivitiesBySessionId";
        readonly saveSession: "db:saveSession";
        readonly saveActivities: "db:saveActivities";
        readonly getStreak: "db:getStreak";
        readonly getUserStats: "db:getUserStats";
        readonly getSessionAnalysis: "db:getSessionAnalysis";
        readonly getLocalStat: "db:getLocalStat";
        readonly setLocalStat: "db:setLocalStat";
        readonly getUnlockedAchievements: "db:getUnlockedAchievements";
        readonly unlockAchievement: "db:unlockAchievement";
        readonly getAppUsageStats: "db:getAppUsageStats";
        readonly getTopAppsByCategory: "db:getTopAppsByCategory";
        readonly getTopTitlesByCategory: "db:getTopTitlesByCategory";
        readonly getCategoryStats: "db:getCategoryStats";
        readonly getContextSwitchCount: "db:getContextSwitchCount";
        readonly getSessionCount: "db:getSessionCount";
        readonly getTotalSeconds: "db:getTotalSeconds";
        readonly getWindowTitleStats: "db:getWindowTitleStats";
        readonly getHourlyDistribution: "db:getHourlyDistribution";
        readonly getTotalKeystrokes: "db:getTotalKeystrokes";
        readonly getKeystrokesByApp: "db:getKeystrokesByApp";
        readonly getSkillXP: "db:getSkillXP";
        readonly addSkillXP: "db:addSkillXP";
        readonly getAllSkillXP: "db:getAllSkillXP";
        readonly getActiveGoals: "db:getActiveGoals";
        readonly getAllGoals: "db:getAllGoals";
        readonly createGoal: "db:createGoal";
        readonly completeGoal: "db:completeGoal";
        readonly updateGoal: "db:updateGoal";
        readonly deleteGoal: "db:deleteGoal";
        readonly getGoalProgress: "db:getGoalProgress";
        readonly getTasks: "db:getTasks";
        readonly createTask: "db:createTask";
        readonly toggleTask: "db:toggleTask";
        readonly updateTaskText: "db:updateTaskText";
        readonly deleteTask: "db:deleteTask";
        readonly clearDoneTasks: "db:clearDoneTasks";
        readonly getDailyTotals: "db:getDailyTotals";
        readonly addSkillXPLog: "db:addSkillXPLog";
        readonly getSkillXPHistory: "db:getSkillXPHistory";
        readonly saveCheckpoint: "db:saveCheckpoint";
        readonly getCheckpoint: "db:getCheckpoint";
        readonly clearCheckpoint: "db:clearCheckpoint";
    };
    readonly ai: {
        readonly analyzeSession: "ai:analyzeSession";
        readonly analyzeOverview: "ai:analyzeOverview";
    };
    readonly settings: {
        readonly getAutoLaunch: "settings:getAutoLaunch";
        readonly setAutoLaunch: "settings:setAutoLaunch";
    };
    readonly notify: {
        readonly show: "notify:show";
    };
    readonly data: {
        readonly exportSessions: "data:exportSessions";
    };
    readonly updater: {
        readonly status: "updater:status";
        readonly install: "updater:install";
    };
};
