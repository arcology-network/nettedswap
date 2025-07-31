const hre = require("hardhat");
var frontendUtil = require('@arcologynetwork/frontend-util/utils/util')
const nets = require('../network.json');

async function main() {
  
  accounts = await ethers.getSigners(); 
  const provider = new ethers.providers.JsonRpcProvider(nets[hre.network.name].url);
  const pkCreator=nets[hre.network.name].accounts[0]
  const signerCreator = new ethers.Wallet(pkCreator, provider);
  frontendUtil.ensurePath('data');
  


  const tokenCount=20;  //Token number
  const poolStyle=2;    //Liquidity Pool Organization
                        // 2 - (tokenA tokenB)  (tokenC tokenD)   
                        // 1 - (tokenA tokenB)  (tokenB tokenC)  (tokenC tokenD)

  
  const trnsferMode=false;

  
  let i,tx;

  console.log('===========start create Token=====================')
  const tokenFactory = await ethers.getContractFactory("Token");
  var tokenInsArray=new Array();
  for(i=0;i<tokenCount;i++){
    const tokenIns = await tokenFactory.deploy("token"+i, "TKN"+i);
    await tokenIns.deployed();
    tokenInsArray.push(tokenIns);
    console.log(`Deployed token${i} at ${tokenIns.address}`);
  }
  

  let accountsLength=accounts.length
  let sendCount=100
  var txs=new Array();
  if(trnsferMode){
    console.log('===========start mint token=====================')
    let j;
    for (i=0;i<tokenCount;i++) {
      for(j=0;j+1<accountsLength;j=j+2){
        amount=ethers.utils.parseUnits("1", 18).mul(j%4+1);

        txs=await batchSendTxs(txs,sendCount,frontendUtil.generateTx(function([token,reciver,amount]){
          return token.mint(reciver,amount);
        },tokenInsArray[i],accounts[j].address,amount));
      }
    }
    txs=await batchSendTxs(txs,sendCount,0);

  
    console.log('===========start transfer token=====================')
    for (i=0;i<tokenCount;i++) {
      for(j=0;j+1<accountsLength;j=j+2){
        amount=ethers.utils.parseUnits("1", 18).mul(j%4+1);
        txs=await batchSendTxs(txs,sendCount,frontendUtil.generateTx(function([token,from,to,amount]){
              return token.connect(from).transfer(to,amount);
            },tokenInsArray[i],accounts[j],accounts[j+1].address,amount));

      }
    }
    txs=await batchSendTxs(txs,sendCount,0);

    console.log('===========start approve token=====================')
    for (i=0;i<tokenCount;i++) {
      for(j=0;j+1<accountsLength;j=j+2){
        amount=ethers.utils.parseUnits("1", 18).mul(j%4+1);
        txs=await batchSendTxs(txs,sendCount,frontendUtil.generateTx(function([token,from,routerAdr,amount]){
          return token.connect(from).approve(routerAdr,amount);
        },tokenInsArray[i],accounts[j+1],accounts[j].address,amount));
      }
    }
    txs=await batchSendTxs(txs,sendCount,0);

    console.log('===========start transferFrom token=====================')
    for (i=0;i<tokenCount;i++) {
      for(j=0;j+1<accountsLength;j=j+2){
        amount=ethers.utils.parseUnits("1", 18).mul(j%4+1);
        txs=await batchSendTxs(txs,sendCount,frontendUtil.generateTx(function([token,from,to,amount]){
          return token.connect(to).transferFrom(from.address,to.address,amount);
            },tokenInsArray[i],accounts[j+1],accounts[j],amount));
      }
    }
    txs=await batchSendTxs(txs,sendCount,0);
  }else{
    
    frontendUtil.ensurePath('data/token-mint');
    const handle_token_mint=frontendUtil.newFile('data/token-mint/token-mint.out');
    frontendUtil.ensurePath('data/token-transfer');
    const handle_transfer=frontendUtil.newFile('data/token-transfer/token-transfer.out')

    frontendUtil.ensurePath('data/token-approve');
    const handle_swap_token_approve=frontendUtil.newFile('data/token-approve/token-approve.out')

    frontendUtil.ensurePath('data/token-transfer-from');
    const handle_transfer_from=frontendUtil.newFile('data/token-transfer-from/token-transfer-from.out')

    let pk,signer,pk1,signer1

    for (i=0;i<tokenCount;i++) {
      for(j=0;j+1<accountsLength;j=j+2){
        amount=ethers.utils.parseUnits("1", 18).mul(j%4+1);
        console.log(`swap: ${amount} at i:${i} j:${j}`);

        pk=nets[hre.network.name].accounts[j];
        signer = new ethers.Wallet(pk, provider);

        pk1=nets[hre.network.name].accounts[j+1];
        signer1 = new ethers.Wallet(pk1, provider);

        //mint
        tx = await tokenInsArray[i].populateTransaction.mint(accounts[j].address,amount);
        await writePreSignedTxFile(handle_token_mint,signerCreator,tx);

        //transfer
        tx = await tokenInsArray[i].connect(accounts[j]).populateTransaction.transfer(accounts[j+1].address,amount);
        await writePreSignedTxFile(handle_transfer,signer,tx);

        //approve
        tx = await tokenInsArray[i].connect(accounts[j+1]).populateTransaction.approve(accounts[j].address,amount);
        await writePreSignedTxFile(handle_swap_token_approve,signer1,tx);

        //transferFrom
        tx = await tokenInsArray[i].connect(accounts[j]).populateTransaction.transferFrom(accounts[j+1].address,accounts[j].address,amount);
        await writePreSignedTxFile(handle_transfer_from,signer,tx);

      }
    }
    
  }
  
  
}


async function batchSendTxs(txs,batchCounts,tx){
  if(tx!=0) txs.push(tx);
  if(txs.length>=batchCounts){
    await frontendUtil.waitingTxs(txs);
    console.log(`send successful ${txs.length}`);
    txs=new Array();
  }
  return txs;
}
async function generateTx(fn,...args){
  const tx = await fn(args);
  let receipt; //=await tx.wait();

  await tx.wait()
  .then((rect) => {
      // console.log("the transaction was successful")
      receipt=rect;
  })
  .catch((error) => {
      receipt = error.receipt
      // console.log(error)
  })

  return new Promise((resolve, reject) => {  
    resolve(receipt)
  })
}

/**
 * Waits for multiple transactions to complete and shows the results.
 * @param {Array<Promise>} txs - An array of transaction promises.
 */
async function waitingTxs(txs){
  await Promise.all(txs).then((values) => {
    values.forEach((item,idx) => {
      showResult(parseReceipt(item))
      console.log(item)
    })
  }).catch((error)=>{
    console.log(error)
  })
}

/**
 * Parses a transaction receipt and extracts the status and block height.
 * @param {Object} receipt - The transaction receipt object.
 * @returns {Object} - An object containing the status and height of the transaction.
 */
function parseReceipt(receipt){
  if(receipt.hasOwnProperty("status")){
      return {status:receipt.status,height:receipt.blockNumber}
  }
  return {status:"",height:""}
}

/**
 * Displays the status and height of a transaction.
 * @param {Object} result - The result object containing the status and height.
 */
function showResult(result){
  console.log(`Tx Status:${result.status} Height:${result.height}`)
}

/**
 * Parses an event from a transaction receipt.
 * @param {Object} receipt - The transaction receipt object.
 * @param {string} eventName - The name of the event to parse.
 * @returns {Object|string} - The data of the event if found, otherwise an empty string.
 */
function parseEvent(receipt,eventName){
  if(receipt.hasOwnProperty("status")&&receipt.status==1){
      for(i=0;i<receipt.events.length;i++){
          if(receipt.events[i].event===eventName){
              return receipt.events[i].data;
          } 
      }
  }
  return "";
}


async function swap(tokenA,tokenB,fee,from,amountIn,swapRouter,isExecute){
  const params = {
      tokenIn: tokenA,                
      tokenOut: tokenB,               
      fee: fee,                            
      recipient: from.address,                    
      deadline: Math.floor(Date.now() / 1000) + 60 * 10, 
      amountIn: amountIn, 
      amountOutMinimum: 0,                     
      sqrtPriceLimitX96: 0                     
  };
  if(isExecute){
    // return swapRouter.connect(from).exactInputSingleDefer(params, {
    //   gasLimit: 500000000 
    // });
    return swapRouter.connect(from).exactInputSingleDefer(params);
  }else{
    return swapRouter.connect(from).populateTransaction.exactInputSingleDefer(params, {
      gasLimit: 500000000 
    });
  }
  

}

function getRandom(seed){
  return Math.floor(Math.random() * seed) + 1;
}
function getLiquidityParams(tokenInsA,tokenInsB,amountA,amountB){
  const tokenA=tokenInsA.address;
  const tokenB=tokenInsB.address;

  let amount0Desired=amountA;
  let amount1Desired=amountB;
  let token0,token1;

  if(tokenA < tokenB){
    token0=tokenA;
    token1=tokenB;
  }else{
    token0=tokenB;
    token1=tokenA;

    amount0Desired=amountB;
    amount1Desired=amountA;

  }

  return [token0,token1,amount0Desired,amount1Desired]
}

async function getBalance(token,account,tokenIdx){
  const decimals=18;
  balance = await token.balanceOf(account.address);
  formattedBalance = ethers.utils.formatUnits(balance, decimals);
  console.log(`Balance of account ${account.address}: ${formattedBalance} token${tokenIdx}`);
}

async function deployBaseContract(){
  console.log('===========start UniswapV3Factory=====================')
  const UniswapV3Factory = await hre.ethers.getContractFactory("UniswapV3Factory");
  const swapfactory = await UniswapV3Factory.deploy();
  await swapfactory.deployed();
  console.log("UniswapV3Factory deployed to:", swapfactory.address);


  console.log('===========start deploy WETH9=====================');
  const weth9_factory = await ethers.getContractFactory("WETH9");
  const weth9 = await weth9_factory.deploy();
  await weth9.deployed();
  console.log(`Deployed WETH9 at ${weth9.address}`);
  const weth9addr=weth9.address

  console.log('===========start deploy NFTDescriptor=====================');
  const Lib = await ethers.getContractFactory("NFTDescriptor");
  const lib = await Lib.deploy();
  await lib.deployed();
  console.log(`Deployed NFTDescriptor at ${lib.address}`);
  
  console.log('===========start deploy NonfungibleTokenPositionDescriptor=====================');
  const nativeCurrencyLabelBytes = ethers.utils.formatBytes32String("ACL");
  const NonfungibleTokenPositionDescriptor_factory = await hre.ethers.getContractFactory("NonfungibleTokenPositionDescriptor", {
    signer: accounts[0],
    libraries: {
      NFTDescriptor: lib.address,
    },
  });
  const nonfungibleTokenPositionDescriptor = await NonfungibleTokenPositionDescriptor_factory.deploy(
    weth9.address,
    nativeCurrencyLabelBytes
  );
  await nonfungibleTokenPositionDescriptor.deployed();
  console.log("nonfungibleTokenPositionDescriptor deployed to:", nonfungibleTokenPositionDescriptor.address);
  
  console.log('===========start deploy NonfungiblePositionManager=====================');
  const NonfungiblePositionManager_factory = await hre.ethers.getContractFactory("NonfungiblePositionManager");
  const nonfungiblePositionManager = await NonfungiblePositionManager_factory.deploy(
    swapfactory.address,   
    weth9.address,
    nonfungibleTokenPositionDescriptor.address               
  );
  await nonfungiblePositionManager.deployed();
  console.log("NonfungiblePositionManager deployed to:", nonfungiblePositionManager.address);

  console.log('===========start deploy SwapRouter=====================');
  const router_factory = await hre.ethers.getContractFactory("SwapRouter");
  const router = await router_factory.deploy(
    swapfactory.address,   
    weth9.address            
  );
  const receipt = await router.deployed();
  // frontendUtil.showResult(frontendUtil.parseReceipt(receipt));
  // console.log(receipt);
  console.log("SwapRouter deployed to:", router.address);


  
  return [swapfactory,nonfungiblePositionManager,router]
}



async function writePreSignedTxFile(txfile,signer,tx){
  const fulltx=await signer.populateTransaction(tx)
  const rawtx=await signer.signTransaction(fulltx)
  frontendUtil.appendTo(txfile,rawtx+',\n')
}

function computeMintAmount(token0,token1,amount1,price){
  let amountA,amountB;
  if(token0 < token1){
    amountA=amount1.div(price);
    amountB=amount1;
  }else{
    amountA=amount1;
    amountB=amount1.div(price);
  }
  return [amountA,amountB]
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
