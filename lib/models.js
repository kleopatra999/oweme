var Q = require("q")
  , orm = require("orm")
  , crypto = require("./crypto")

module.exports = function(db, callback) {
    var Currency = db.define("currency", {
        name: String,
        symbol: String
    });
    var User = db.define("user", {
        firstName: String,
        lastName: String,
        email: String,
        registrationDate: Date,
        loginDate: Date,
        password: String,
    }, {
        autoFetch: true,
        autoFetchLimit: 2,
        validations: {
            firstName: orm.validators.notEmptyString("missing"),
            lastName: orm.validators.notEmptyString("missing"),
            email: orm.validators.patterns.email("not an email"),
        },
        methods: {
            verifyPassword: function(password) {
                return crypto.compare(password, this.password);
            },

            fullName: function() {
                return this.firstName + " " + this.lastName;
            },

            loans: function(inactive) {
                var deferred = Q.defer();
                var Debt = db.models.debt;
                var options = {
                    lender: this.email,
                    active: !inactive
                };
                Debt.find(options, function(err, devts) {
                    if (err) return deferred.reject(err);
                    deferred.resolve(devts);
                });
                return deferred.promise;
            },

            debts: function(inactive) {
                var deferred = Q.defer();
                var debt = db.models.debt;
                var options = {
                    debtor: this.email,
                    active: !inactive
                };
                Debt.find(options, function(err, debts) {
                    if (err) return deferred.reject(err);
                    deferred.resolve(debts);
                });
                return deferred.promise;
            },

            history: function() {
                var state = [];
                function concatter(e) { state = state.concat(e); }
                var promises = [
                    this.debts(true).then(concatter),
                    this.loans(true).then(concatter)
                ];
                return Q.all(promises).then(function() {
                    state.sort(function(a, b) {
                        return b.creationDate - a.creationDate;
                    });
                    return state;
                });
            },

            notifications: function() {
                var deferred = Q.defer();
                var Notif = db.models.notification;
                Notif.find({to: this.email}, function(err, notifs) {
                    if (err) return deferred.reject(err);
                    deferred.resolve(notifs);
                });
                return deferred.promise;
            }
        }
    });

    var Debt = db.define("debt", {
        value: Number,
        comment: String,
        active: Boolean,
        creationDate: Date,
        lender: String, // lender email
        debtor: String, // debtor email
    }, {
        autoFetch: true,
        validations: {
            value: orm.validators.rangeNumber(0, undefined, "value should be non-negative"),
            lender: orm.validators.patterns.email("Lender should have valid email address"),
            debtor: orm.validators.patterns.email("Debtor should ahve valid email address"),
        },
        methods: {
            lenderOrDebtor: function(user)
            {
                return this.lender === user.email || this.debtor === user.email;
            },

            partner: function(user)
            {
                return this.lender === user.email ? this.debtor : this.lender;
            },

            resolve: function()
            {
                this.active = false;
                return Q.denodeify(this.save.bind(this))()
                .then(function() {
                    return this;
                }.bind(this));
            },

            prettyValue: function()
            {
                return this.value + this.currency.symbol;
            }
        }
    });
    Debt.hasOne("currency", Currency);

    var Notification = db.define("notification", {
        from: String,
        to: String,
        creationDate: Date,
        text: String
    });

    return callback();
}
