﻿// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

/// <reference path="../../typings/node.d.ts" />
/// <reference path="../../typings/Q.d.ts" />
/// <reference path="../../typings/tacoUtils.d.ts" />

"use strict";

import child_process = require ("child_process");
import path = require ("path");
import Q = require ("q");
import util = require ("util");

import tacoUtils = require ("taco-utils");

import utils = tacoUtils.UtilHelper;
import BuildInfo = tacoUtils.BuildInfo;

interface IEmulateRequest { appDir: string; appName: string; target: string, version: string, timeout: number };

// Note: this file is not intended to be loaded as a module, but rather in a separate process.
process.on("message", function (emulateRequest: IEmulateRequest): void {
    Q(IOSEmulateHelper.emulate(emulateRequest))
        .then(function (result: { status: string; messageId: string; messageArgs?: any }): void {
        process.send(result);
    }).done();
});

class IOSEmulateHelper {
    private static IOS_SIMULATOR_TARGETS: { [id: string]: string } = {
        "iphone 4s": "iPhone-4s",
        "iphone 5": "iPhone-5",
        "iphone 5s": "iPhone-5s",
        "iphone 6": "iPhone-6",
        "iphone 6 plus": "iPhone-6-Plus",
        "iphone 6s": "iPhone-6s",
        "iphone 6s plus": "iPhone-6s-Plus",
        "ipad 2": "iPad-2",
        "ipad air": "iPad-Air",
        "ipad retina": "iPad-Retina"
    };

    public static emulate(emulateRequest: IEmulateRequest): Q.Promise<{ status: string; messageId: string; messageArgs?: any }> {
        return Q.fcall(IOSEmulateHelper.cdToAppDir, emulateRequest.appDir)
        .then(function (): Q.Promise<{}> { return IOSEmulateHelper.cordovaEmulate(emulateRequest); })
        .then(function success(): { status: string; messageId: string; messageArgs?: any } {
            return { status: BuildInfo.EMULATED, messageId: "EmulateSuccess" };
        }, function fail(e: any): { status: string; messageId: string; messageArgs?: any } {
            if (e.status) {
                return e;
            } else {
                return { status: BuildInfo.ERROR, messageId: "EmulateFailedWithError", messageArgs: e.message };
            }
        });
    }

    private static cdToAppDir(appDir: string): void {
        process.chdir(appDir);
    }

    private static cordovaEmulate(emulateRequest: IEmulateRequest): Q.Promise<{}> {
        var deferred: Q.Deferred<any> = Q.defer();
        var emulatorAppPath: string = utils.quotesAroundIfNecessary(path.join(emulateRequest.appDir, "platforms", "ios", "build", "emulator", emulateRequest.appName + ".app"));
        var emulatorProcess: child_process.ChildProcess = utils.loggedExec(util.format("ios-sim launch %s %s --exit", emulatorAppPath, IOSEmulateHelper.iosSimTarget(emulateRequest.target, emulateRequest.version)), {}, function (error: Error, stdout: Buffer, stderr: Buffer): void {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve({});
            }
        });
        // When run via SSH / without a GUI, ios-sim can hang indefinitely. A cold launch can take on the order of 5 seconds.
        var emulatorTimeout: NodeJS.Timer = setTimeout(function (): void {
            emulatorProcess.kill();
            deferred.reject({ status: BuildInfo.ERROR, messageId: "EmulateFailedTimeout" });
        }, emulateRequest.timeout);

        return deferred.promise.finally(function (): void {
            clearTimeout(emulatorTimeout);
        });
    }

    private static iosSimTarget(emulateRequestTarget: string, version: string): string {
        // Allow for non-recognised targets to be directly specified, but strip out invalid characters
        var iosSimTarget: string = IOSEmulateHelper.IOS_SIMULATOR_TARGETS[emulateRequestTarget.toLowerCase()] || emulateRequestTarget.replace(/[^a-zA-Z0-9-]/g, "");
        if (version && version.match(/[0-9]*\.[0-9]*/)) {
            iosSimTarget = util.format("%s, %s", iosSimTarget, version);
        }
        return util.format("--devicetypeid '%s'", iosSimTarget);
    }
}
