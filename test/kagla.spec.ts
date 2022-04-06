import { getKaglaInfo } from '../src/kagla'
it('print info', async () => {
  const result = await getKaglaInfo()
  console.log(result)
})
