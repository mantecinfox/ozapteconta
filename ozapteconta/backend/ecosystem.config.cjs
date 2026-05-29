const utf8Env = {
  LANG: "pt_BR.UTF-8",
  LC_ALL: "pt_BR.UTF-8",
  LC_CTYPE: "pt_BR.UTF-8",
};

module.exports = {
  apps: [
    {
      name: "ozapteconta",
      script: "npm",
      args: "start",
      cwd: "/home/pc/ozapteconta/backend",
      env: {
        NODE_ENV: "production",
        ...utf8Env,
      },
    },
    {
      name: "ozapteconta-worker-fipe",
      script: "npm",
      args: "run start:worker:fipe",
      cwd: "/home/pc/ozapteconta/backend",
      env: {
        NODE_ENV: "production",
        ...utf8Env,
        WORKER_QUEUE: "svc_fipe",
        WORKER_CONCURRENCY: "2",
      },
    },
    {
      name: "ozapteconta-worker-market",
      script: "npm",
      args: "run start:worker:market",
      cwd: "/home/pc/ozapteconta/backend",
      env: {
        NODE_ENV: "production",
        ...utf8Env,
        WORKER_QUEUE: "svc_market",
        WORKER_CONCURRENCY: "2",
      },
    },
    {
      name: "ozapteconta-worker-nutrition",
      script: "npm",
      args: "run start:worker:nutrition",
      cwd: "/home/pc/ozapteconta/backend",
      env: {
        NODE_ENV: "production",
        ...utf8Env,
        WORKER_QUEUE: "svc_nutrition",
        WORKER_CONCURRENCY: "2",
      },
    },
    {
      name: "ozapteconta-worker-expenses",
      script: "npm",
      args: "run start:worker:expenses",
      cwd: "/home/pc/ozapteconta/backend",
      env: {
        NODE_ENV: "production",
        ...utf8Env,
        WORKER_QUEUE: "svc_expenses",
        WORKER_CONCURRENCY: "3",
      },
    },
    {
      name: "ozapteconta-worker-fipezap",
      script: "npm",
      args: "run start:worker:fipezap",
      cwd: "/home/pc/ozapteconta/backend",
      env: {
        NODE_ENV: "production",
        ...utf8Env,
        WORKER_QUEUE: "svc_fipezap",
        WORKER_CONCURRENCY: "1",
      },
    },
    {
      name: "ozapteconta-worker-flights",
      script: "npm",
      args: "run start:worker:flights",
      cwd: "/home/pc/ozapteconta/backend",
      env: {
        NODE_ENV: "production",
        ...utf8Env,
        WORKER_QUEUE: "svc_flights",
        WORKER_CONCURRENCY: "1",
      },
    },
    {
      name: "ozapteconta-worker-reserve-3",
      script: "npm",
      args: "run start:worker:reserve3",
      cwd: "/home/pc/ozapteconta/backend",
      env: {
        NODE_ENV: "production",
        ...utf8Env,
        WORKER_QUEUE: "svc_reserve_3",
        WORKER_CONCURRENCY: "1",
      },
    },
    {
      name: "ozapteconta-worker-reserve-4",
      script: "npm",
      args: "run start:worker:reserve4",
      cwd: "/home/pc/ozapteconta/backend",
      env: {
        NODE_ENV: "production",
        ...utf8Env,
        WORKER_QUEUE: "svc_reserve_4",
        WORKER_CONCURRENCY: "1",
      },
    },
    {
      name: "ozapteconta-worker-reserve-5",
      script: "npm",
      args: "run start:worker:reserve5",
      cwd: "/home/pc/ozapteconta/backend",
      env: {
        NODE_ENV: "production",
        ...utf8Env,
        WORKER_QUEUE: "svc_reserve_5",
        WORKER_CONCURRENCY: "1",
      },
    },
  ],
};
