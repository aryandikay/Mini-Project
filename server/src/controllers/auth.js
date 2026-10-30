export function authControllers(service, cookie) {
  return {
    login: async (req, res) => {
      const result = await service.login(req.body, req.ip, req.sessionToken);
      res.cookie(cookie.name, result.token, { ...cookie.options, maxAge: cookie.ttl }).json({ data: result.user });
    },
    logout: (req, res) => {
      service.logout(req.sessionToken);
      res.clearCookie(cookie.name, cookie.options).json({ data: { loggedOut: true } });
    },
    me: (req, res) => res.json({ data: req.user }),
    profile: (req, res) => res.json({ data: service.profile(req.user, req.body) }),
    changePassword: async (req, res) => {
      const result = await service.changePassword(req.user, req.body);
      res.clearCookie(cookie.name, cookie.options).json({ data: result });
    },
    users: (req, res) => res.json({ data: service.users(req.user) }),
    createStaff: async (req, res) => res.status(201).json({ data: await service.createStaff(req.user, req.body) }),
    status: (req, res) => res.json({ data: service.status(req.user, req.accountId, req.body) }),
  };
}
