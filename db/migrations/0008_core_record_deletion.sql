-- Only core records can be removed. Foreign keys protect accounts and business history.
GRANT DELETE ON app.clusters, app.units, app.people TO proomahan_app;
