var Test = require('../config/testConfig.js');
var BigNumber = require('bignumber.js');

contract('Flight Surety Tests', async (accounts) => {

  var config;
  before('setup contract', async () => {
    config = await Test.Config(accounts);
    // await config.flightSuretyData.authorizeCaller(config.flightSuretyApp.address, { from: config.ownerAirline });
  });

  /****************************************************************************************/
  /* Operations and Settings                                                              */
  /****************************************************************************************/

  it(`(multiparty) has correct initial isOperational() value`, async function () {

    // Get operating status
    let status = await config.flightSuretyData.isOperational.call();
    assert.equal(status, true, "Incorrect initial operating status value");

  });

  it(`(multiparty) can block access to setOperatingStatus() for non-Contract Owner account`, async function () {

      // Ensure that access is denied for non-Contract Owner account
      // ARRANGE
      let reverted = false;
      let statusBefore = await config.flightSuretyData.isOperational.call();
      assert.equal(statusBefore, true, "Expected to test with operational contract.");
      // ACT
      try 
      {
          await config.flightSuretyData.setOperatingStatus(false, { from: config.testAddresses[2] });
      }
      catch(e) {
          reverted = true;
          // ASSERT
          let statusAfter = await config.flightSuretyData.isOperational.call();
          assert.equal(statusAfter, statusBefore, "Only owner should be able to change operational status");
      }
      // ASSERT
      assert.equal(reverted, true, "Access not restricted to Contract Owner");
            
  });

  it(`(multiparty) can allow access to setOperatingStatus() for Contract Owner account`, async function () {

      // Ensure that access is allowed for Contract Owner account
      
      // ARRANGE
      let reverted = false;
      let statusBefore = await config.flightSuretyData.isOperational.call();
      assert.equal(statusBefore, true, "Expected to test with operational contract.");
      
      // ACT
      try 
      {
          await config.flightSuretyData.setOperatingStatus(false, { from: config.owner });
      }
      catch(e) {
          reverted = true;
      }
      
      // ASSERT
      assert.equal(reverted, false, "Unexpected revert: Contract owner should have access");
      let statusAfter = await config.flightSuretyData.isOperational.call();
      assert.equal(statusAfter, !statusBefore, "Owner should be able to change operational status");
      
  });

  // it(`(multiparty) can block access to functions using requireIsOperational when operating status is false`, async function () {

  //     // ARRANGE
  //     await config.flightSuretyData.setOperatingStatus(false, { from: config.owner });
  //     let reverted = false;

  //     // ACT
  //     try
  //     {
  //         await config.flightSuretyApp.testIsBool(true, { from: config.owner });
  //         // await config.flightSurety.setTestingMode(true);
  //     }
  //     catch(e) {
  //         reverted = true;
  //     }

  //     // ASSERT
  //     assert.equal(reverted, true, "Access not blocked for requireIsOperational");      

  //     // Set it back for other tests to work
  //     await config.flightSuretyData.setOperatingStatus(true, { from: config.ownerAirline });

  // });

  /****************************************************************************************/
  /*  Airlines                                                                            */
  /****************************************************************************************/

  it('(airline) cannot register an Airline using registerAirline() if it is not funded', async () => {
    
    // ARRANGE
    let newAirline = accounts[2];

    // ACT
    try {
        await config.flightSuretyApp.registerAirline(newAirline, {from: config.owner});
    }
    catch(e) {

    }
    let result = await config.flightSuretyData.isRegistered.call(newAirline); 

    // ASSERT
    assert.equal(result, false, "Airline should not be able to register another airline if it hasn't provided funding");

  });

  // first 4 airlines: only existing airlines may register another airline
  it('(airline) can only register another airline unanimously, as long as there are less than 4', async () => {
      
    // ARRANGE
    let { ownerAirline, secondAirline, thirdAirline, fourthAirline, flightSuretyApp, flightSuretyData } = config;
    let newAirline = accounts[4];
    let deposit = await flightSuretyData.AIRLINE_FEE.call();
    let ownerAirlineIsRegistered = await flightSuretyData.isRegistered.call(ownerAirline);
    assert.equal(ownerAirlineIsRegistered, true, "Expected owner airline to be registered");

    // ACT
    try {
      await flightSuretyApp.sendTransaction({from: ownerAirline, value: deposit});
    } catch(e) {
      console.log(e)
    }
    let ownerAirlineIsFunded = await flightSuretyData.isAirline.call(ownerAirline);
    assert.equal(ownerAirlineIsFunded, true, "Expected owner airline to be funded and recognized");

    await flightSuretyApp.registerAirline(secondAirline, {from: ownerAirline});
    let secondAirlineIsRegistered = await flightSuretyData.isRegistered.call(secondAirline);
    assert.equal(secondAirlineIsRegistered, true, "Expected second airline to be registered");

    await flightSuretyApp.sendTransaction({from: secondAirline, value: deposit});
    let secondAirlineIsFunded = await flightSuretyData.isAirline.call(secondAirline);
    assert.equal(secondAirlineIsFunded, true, "Second airline should be recognized");

    await config.flightSuretyApp.registerAirline(thirdAirline, {from: secondAirline});
    await config.flightSuretyApp.registerAirline(fourthAirline, {from: ownerAirline});
    try {
        // fund ownerAirline
        await config.flightSuretyApp.registerAirline(newAirline, {from: ownerAirline});
    } catch(e) {

    }
    let result = await flightSuretyData.isRegistered.call(newAirline);
    
    // ASSERT
    assert.equal(result, false, "Airline should not be able to register another airline unanimously, if 4 exist already");

  })

  // 5th+ airline: 50% consensus among registered airlines required
  it('(multiparty) can register 5th airline, with the votes of 2 out of the 4 registered airlines', async () => {

    // ARRANGE
    let { thirdAirline, fourthAirline, fifthAirline, flightSuretyData, flightSuretyApp } = config;
    let deposit = await flightSuretyData.AIRLINE_FEE.call();

    // ACT
    await flightSuretyApp.sendTransaction({from: thirdAirline, value: deposit});
    await flightSuretyApp.sendTransaction({from: fourthAirline, value: deposit});
    await config.flightSuretyApp.registerAirline(fifthAirline, { from: config.thirdAirline });
    let airlineStatusBeforeSecondVote = await config.flightSuretyData.isRegistered.call(fifthAirline);
    assert.equal(airlineStatusBeforeSecondVote, false, "Airline should not be registered with a minority of votes");
    await config.flightSuretyApp.registerAirline(fifthAirline, { from: config.fourthAirline });
    let airlineStatusAfterSecondVote = await config.flightSuretyData.isRegistered.call(fifthAirline);

    // ASSERT
    assert.equal(airlineStatusAfterSecondVote, true, "Airline should be registered with 50% of the votes");

  })

  it('(airline) can register a flight', async () => {

    // ARRANGE
    let { ownerAirline, flightSuretyApp, flightSuretyData, flight, departureTimestamp } = config;
    let notAnAirline = accounts[6];

    // ACT
    try {
      await flightSuretyApp.registerFlight(flight, departureTimestamp, { from: notAnAirline });
    }
    catch(e) {}
    let registrationStatusWithInvalidAirline = await flightSuretyData.isFlight.call(notAnAirline, flight, departureTimestamp);
    assert.equal(registrationStatusWithInvalidAirline, false, 'Flight should not be registered with invalid airline');
    await flightSuretyApp.registerFlight(flight, departureTimestamp, { from: ownerAirline });
    let registrationStatus = await flightSuretyData.isFlight.call(ownerAirline, flight, departureTimestamp);

    // ASSERT
    assert.equal(registrationStatus, true, "Flight should be registered");

  })

  it('(passenger) can purchase up to 1 Ether insurance for a flight', async () => {

    // ARRANGE
    let { ownerAirline, passenger, flightSuretyApp, flightSuretyData } = config;
    let flight = 'MM1990';
    let departureTimestamp = Math.floor(Date.now() / 1000);
    let negativePayment = web3.utils.toWei('-0.2', 'ether');
    let payment = web3.utils.toWei('0.2', 'ether');
    let highPayment = web3.utils.toWei('10', 'ether');

    // ACT
    await flightSuretyApp.registerFlight(flight, departureTimestamp, { from: ownerAirline });
    try {
      await flightSuretyData.buy(ownerAirline, flight, departureTimestamp, {from: passenger, value: negativePayment});
    } catch(e) {}
    let insuranceForNegativeAmount = await flightSuretyData.insuranceCoverageForFlight.call(passenger, ownerAirline, flight, departureTimestamp);
    assert.equal(insuranceForNegativeAmount.toNumber(), 0, "Negative Amount: Passenger should not be insured");
    try {
      await flightSuretyData.buy(ownerAirline, flight, departureTimestamp, {from: passenger, value: highPayment});
    } catch(e) {}
    let insuranceForTooHighAmount = await flightSuretyData.insuranceCoverageForFlight.call(passenger, ownerAirline, flight, departureTimestamp);
    assert.equal(insuranceForTooHighAmount.toNumber(), 0, "Too high: Passenger should not be insured");

    await flightSuretyData.buy(ownerAirline, flight, departureTimestamp, {from: passenger, value: payment});
    let insurance = await flightSuretyData.insuranceCoverageForFlight.call(passenger, ownerAirline, flight, departureTimestamp);

    // ASSERT
    assert(insurance > 0, "Passenger should be insured by a positive amount");

  })

  it('(passenger) receives 1.5x the insured amount if flight is late due to airline fault', async () => {

    // ARRANGE
    const STATUS_CODE_UNKNOWN = 0;
    const STATUS_CODE_ON_TIME = 10;
    const STATUS_CODE_LATE_AIRLINE = 20;
    const STATUS_CODE_LATE_WEATHER = 30;
    const STATUS_CODE_LATE_TECHNICAL = 40;
    const STATUS_CODE_LATE_OTHER = 50;
    let { flightSuretyApp, flightSuretyData, ownerAirline, departureTimestamp, flight, passenger } = config;
    let insurancePayment = web3.utils.toWei('0.6', 'ether');
    const TEST_ORACLES_COUNT = 20;
    let fee = await flightSuretyApp.REGISTRATION_FEE.call();
    let validOracles = [];
    let invalidOracles = [];
    let walletBefore = await web3.eth.getBalance(passenger);
    console.log("WALLET BEFORE: ", web3.utils.fromWei(walletBefore));
    for (let a = 0; a < TEST_ORACLES_COUNT; a++) {
      await flightSuretyApp.registerOracle({ from: accounts[a], value: fee });
    }

    // ACT
    await flightSuretyData.buy(ownerAirline, flight, departureTimestamp, {from: passenger, value: insurancePayment});

    let insurance = await flightSuretyData.insuranceCoverageForFlight.call(passenger, ownerAirline, flight, departureTimestamp, { from: passenger });
    assert(Number(insurance), Number(insurancePayment), "Expected insurance to match paid amount");
    console.log("INSURANCE: ", web3.utils.fromWei(insurance));

    await flightSuretyApp.fetchFlightStatus(ownerAirline, flight, departureTimestamp, {from: passenger});

    await flightSuretyApp.getPastEvents('OracleRequest', { fromBlock: 0, toBlock: 'latest' })
      .then(async events => {

        // ARRANGE
        let event = events[0];
        let { index, airline, flight, timestamp } = event.returnValues;
        while(validOracles.length < 3){
          validOracles = [];
          invalidOracles = [];
          for (let a = 0; a < TEST_ORACLES_COUNT; a++) {
            let result = await flightSuretyApp.getMyIndexes.call({from: accounts[a]});
            if (result[0] == index || result[1] == index || result[2] == index) {
              console.log(`VALID: oracle ${a} matching index ${index}`);
              validOracles.push(accounts[a]);
            } else {
              console.log(`INVALID: oracle ${a} matching no index`);
              invalidOracles.push(accounts[a]);
            }
          }
        }

        // ACT
        try {
          await flightSuretyApp.submitOracleResponse(index, airline, flight, timestamp, STATUS_CODE_ON_TIME, {
            from: invalidOracles[0],
          });
        } catch(e) {}
        let creditsAfterInvalidSubmission = await flightSuretyData.getCredits({from: passenger});
        assert(creditsAfterInvalidSubmission == 0, "Insurance amount should not be credited after an invalid oracle submission");
        try {
          await flightSuretyApp.submitOracleResponse(index, airline, flight, timestamp, STATUS_CODE_LATE_WEATHER, {
            from: validOracles[0],
          });
        } catch(e) {}
        let creditsAfterWrongResponse = await flightSuretyData.getCredits({from: passenger});
        assert(creditsAfterWrongResponse == 0, "Insurance amount should not be credited for a status other than 20");
        await flightSuretyApp.submitOracleResponse(index, airline, flight, timestamp, STATUS_CODE_LATE_AIRLINE, {
          from: validOracles[0],
        });
        await flightSuretyApp.submitOracleResponse(index, airline, flight, timestamp, STATUS_CODE_LATE_AIRLINE, {
          from: validOracles[1],
        });
        //
        let creditsBeforeMinResponses = await flightSuretyData.getCredits({from: passenger});
        assert(creditsBeforeMinResponses.toNumber() == 0, "Insurance amount should not be credited before oracle treshold is reached");
        
        console.log("VALID ORACLES", index, airline, flight, timestamp, STATUS_CODE_LATE_AIRLINE);
        console.log(validOracles[0], validOracles[1], validOracles[2]);
        await flightSuretyApp.submitOracleResponse(index, airline, flight, timestamp, STATUS_CODE_LATE_AIRLINE, {
          from: validOracles[2],
        });
        return;
      })
      await flightSuretyApp.getPastEvents('OracleReport', { fromBlock: 0, toBlock: 'latest' })
        .then(async events => {

          let event;
          let airline;
          let flight;
          let timestamp;
          let status;
        
          for (i=0; i < events.length; i++) {
            event = events[i];
            airline = event.returnValues.airline;
            flight = event.returnValues.flight;
            timestamp = event.returnValues.timestamp;
            status = event.returnValues.status;
            console.log(`${airline}, ${flight}, ${timestamp}, ${status}`);
          }
          
          // ASSERT
          let credits = await flightSuretyData.getCredits({from: passenger});
          let etherCredits = web3.utils.fromWei(credits);
          let etherInsurancePayment = web3.utils.fromWei(insurancePayment);
          console.log("credits: ", web3.utils.fromWei(credits));
          console.log("insurancePayment: ", web3.utils.fromWei(insurancePayment));
          assert(Math.floor(etherCredits) * 2 == Math.floor(etherInsurancePayment) * 3, "Passenger should be credited 1.5x the insurance amount");

          // No direct passenger withdrawal
          let walletAfter = await web3.eth.getBalance(passenger);
          let etherWallet = web3.utils.fromWei(walletAfter);
          console.log("WALLET AFTER: ", etherWallet);
          
          // Passenger can withdraw
          assert(etherCredits > 0, "Should not payout directly to wallet");
          await flightSuretyData.pay({ from: passenger });
          let creditsAfterPayout = await flightSuretyData.getCredits({from: passenger});
          assert(creditsAfterPayout == 0, "Credits should reset to 0 after payout");
          let walletAfterPayout = await web3.eth.getBalance(passenger);
          let etherWalletAfterPayout = web3.utils.fromWei(walletAfterPayout);
          console.log("WALLET FINAL: ", etherWalletAfterPayout);
          return assert(Math.round(Math.round(etherWallet * 100) + Math.round(etherCredits * 100)) == Math.round(etherWalletAfterPayout * 100), "Credits should have been sent to wallet");

      });
  })

});